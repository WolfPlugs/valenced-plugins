@file:JvmName("ChatRagdoll")

package org.wolfies.chatragdoll

import android.app.Activity
import android.app.Application
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Picture
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.drawable.Drawable
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.Window
import android.widget.TextView
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Modifier
import java.lang.reflect.Proxy
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.sin
import kotlin.random.Random

private const val CHAT_LIST_MANAGER = "com.discord.chat.presentation.list.ChatListViewManager"
private const val RECYCLER_VIEW = "androidx.recyclerview.widget.RecyclerView"

val chatRagdoll = plugin {
    val main = Handler(Looper.getMainLooper())
    var effect: ChatEffect? = null
    var running: AtomicBoolean? = null

    start {
        val active = AtomicBoolean(true)
        running = active

        registerNativeMethod("${manifest.id}.update") { args ->
            val push = args.firstOrNull() == true
            main.post {
                if (active.get()) {
                    if (push) effect?.push() else effect?.reset()
                }
            }
            true
        }

        if (Build.VERSION.SDK_INT < 29) return@start
        val loader = classLoader
        val listClass = loader.loadClass(CHAT_LIST_MANAGER).declaredMethods
            .single { it.name == "setFloatingChatInputEnabled" && !it.isBridge }
            .parameterTypes[0]
        val recyclerClass = loader.loadClass(RECYCLER_VIEW)
        val identities = RowIdentities(recyclerClass)

        withAppActivity { activity ->
            main.post {
                if (!active.get()) return@post
                effect?.dispose()
                val next = ChatEffect(activity.application, listClass, recyclerClass, identities, main)
                effect = next
                activity.application.registerActivityLifecycleCallbacks(next)
                next.onActivityResumed(activity)
            }
        }
    }

    stop {
        running?.set(false)
        running = null
        main.post {
            effect?.dispose()
            effect = null
        }
    }
}

private class ChatEffect(
    private val application: Application,
    private val listClass: Class<*>,
    private val recyclerClass: Class<*>,
    private val identities: RowIdentities,
    private val main: Handler,
) : Application.ActivityLifecycleCallbacks, SensorEventListener,
    ViewTreeObserver.OnPreDrawListener, View.OnAttachStateChangeListener {

    private val sensors = application.getSystemService(SensorManager::class.java)
    private var activity: Activity? = null
    private var list: ViewGroup? = null
    private var observer: ViewTreeObserver? = null
    private val visibleBounds = Rect()
    private val hidden = HashMap<View, Float>()
    private val eligible = HashSet<Long>()
    private val fallen = HashSet<Long>()
    private val upright = HashSet<Long>()
    private var tilt = 0f
    private var gyro = 0f
    private var touchHook: (() -> Unit)? = null
    private var grabbed: Row? = null
    private var dragging = false
    private val listLocation = IntArray(2)
    private var touchX = 0f
    private var touchY = 0f
    private var touchTime = 0L
    private var flingX = 0f
    private var flingY = 0f
    private val pile = ArrayDeque<Row>()
    private val layer = PileDrawable(pile)
    private var lastShake = -1000L
    private var firstHit = -1000L
    private var previousFrame = 0L

    override fun onActivityResumed(activity: Activity) {
        if (this.activity === activity) return
        sensors?.unregisterListener(this)
        reset()
        this.activity = activity
        firstHit = -1000L
        val accelerometer = sensors?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return
        sensors.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_GAME, main)
        for (type in intArrayOf(Sensor.TYPE_GYROSCOPE, Sensor.TYPE_GRAVITY)) {
            sensors.getDefaultSensor(type)?.let {
                sensors.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME, main)
            }
        }
    }

    override fun onActivityPaused(activity: Activity) {
        if (this.activity !== activity) return
        sensors?.unregisterListener(this)
        this.activity = null
        reset()
    }

    override fun onSensorChanged(event: SensorEvent) {
        val (x, y, z) = event.values
        if (event.sensor.type != Sensor.TYPE_ACCELEROMETER) {
            val target = list ?: return
            val previousTilt = tilt
            val previousGyro = gyro
            if (event.sensor.type == Sensor.TYPE_GRAVITY) {
                tilt = (-x / SensorManager.GRAVITY_EARTH).coerceIn(-1f, 1f)
            } else {
                gyro = z.coerceIn(-8f, 8f)
                val density = target.resources.displayMetrics.density
                if (abs(y) > 2.5f || abs(x) > 2.5f) {
                    for (row in pile) {
                        row.x.kick((-y * 0.42f).coerceIn(-4f, 4f) * density)
                        if (abs(x) > 3f) row.fall.launch(abs(x).coerceAtMost(8f) * 2f * density)
                    }
                }
            }
            if (abs(gyro - previousGyro) > 0.06f || abs(tilt - previousTilt) > 0.015f ||
                abs(gyro) > 2.5f || previousFrame != 0L)
                target.postInvalidateOnAnimation()
            return
        }
        val threshold = 2.2f * SensorManager.GRAVITY_EARTH
        val now = SystemClock.uptimeMillis()
        if (now - lastShake < 700L || x * x + y * y + z * z < threshold * threshold) return
        if (now - firstHit !in 35L..280L) {
            if (now - firstHit > 280L) firstHit = now
            return
        }
        firstHit = -1000L
        val window = activity?.window?.decorView ?: return
        if (!window.hasWindowFocus()) return
        val target = findChat(window) ?: return
        lastShake = now

        if (list !== target) {
            reset()
            list = target
            observer = target.viewTreeObserver.also { it.addOnPreDrawListener(this) }
            target.addOnAttachStateChangeListener(this)
            target.overlay.add(layer)
            touchHook = observeTouch(activity?.window ?: return)
        }
        eligible.addAll(identities.loadedIds(target))
        upright.clear()
        collectRows(target, attachedRows(target))
        val density = target.resources.displayMetrics.density
        for (row in pile) {
            row.x.kick(randomDirection() * 12f * density)
            row.angle.kick(randomDirection() * 12f)
        }
        layer.invalidateSelf()
        target.invalidate()
    }

    fun push() {
        val target = list ?: return
        val density = target.resources.displayMetrics.density
        for (row in pile) {
            row.fall.launch((18f + Random.nextFloat() * 15f) * density)
            row.x.kick(randomDirection() * 10f * density)
            row.angle.kick(randomDirection() * 12f)
        }
        target.invalidate()
    }

    override fun onPreDraw(): Boolean {
        val target = list ?: return true
        if (!target.isShown || !target.getGlobalVisibleRect(visibleBounds)) {
            reset()
            return true
        }

        val visible = attachedRows(target)
        if (visible.values.any { it !in eligible && it !in upright }) {
            includeLoadedHistory(target, visible)
        }
        val added = collectRows(target, visible)

        val now = SystemClock.uptimeMillis()
        val step = if (previousFrame == 0L) 1f else ((now - previousFrame) / 16.67f).coerceIn(0f, 1.5f)
        val density = target.resources.displayMetrics.density
        val bottom = target.height - target.paddingBottom
        layer.setBounds(0, 0, target.width, target.height)
        var moving = false
        // Resolve support from the bodies underneath each message this frame.
        val bottomFirst = pile.sortedBy { it.fall.height }
        for ((index, row) in bottomFirst.withIndex()) {
            val held = dragging && grabbed === row
            val xMoving = !held && row.x.advance(step, tilt * 75f * density)
            val angleMoving = row.angle.advance(step, gyro * 2f + tilt * 8f)
            var support = 0f
            if (!held) {
                for (lowerIndex in 0 until index) {
                    val lower = bottomFirst[lowerIndex]
                    if (dragging && grabbed === lower) continue
                    if (abs(row.centerX - lower.centerX) < row.halfWidth() + lower.halfWidth()) {
                        support = maxOf(support, lower.fall.height + lower.halfHeight())
                    }
                }
            }
            val floor = support + row.halfHeight() + 3f * density
            val falling = if (held) row.fall.holdAbove(floor) else row.fall.advance(step, density, floor)
            moving = moving || xMoving || falling || angleMoving
            row.centerY = bottom - row.fall.height
        }
        if (added || moving || previousFrame != 0L) layer.invalidateSelf()
        previousFrame = if (moving) now else 0L
        if (moving) target.postInvalidateOnAnimation()
        return true
    }

    private fun attachedRows(target: ViewGroup): Map<View, Long> = buildMap {
        for (index in 0 until target.childCount) {
            val child = target.getChildAt(index)
            identities.id(child)?.let { put(child, it) }
        }
    }

    private fun includeLoadedHistory(target: ViewGroup, visible: Map<View, Long>) {
        val top = visible.minByOrNull { it.key.top }?.value ?: return
        val bottom = visible.maxByOrNull { it.key.top }?.value ?: return
        if (top == bottom) return
        val loaded = identities.loadedIds(target)
        val topIndex = loaded.indexOf(top)
        val bottomIndex = loaded.indexOf(bottom)
        if (topIndex < 0 || bottomIndex < 0) return
        // RecyclerView can present the adapter in either direction. Find the newest row
        // from the last shake in visual order and include newly loaded history above it.
        val ordered = if (topIndex < bottomIndex) loaded else loaded.asReversed()
        val boundary = ordered.indexOfLast { it in eligible }
        if (boundary < 0) return
        for ((index, id) in ordered.withIndex()) {
            if (index <= boundary) {
                if (id !in upright) eligible.add(id)
            } else {
                upright.add(id)
            }
        }
    }

    private fun collectRows(target: ViewGroup, visible: Map<View, Long>): Boolean {
        var added = false
        val density = target.resources.displayMetrics.density
        val bottom = target.height - target.paddingBottom
        for ((child, alpha) in hidden.toMap()) {
            if (visible[child] in fallen) continue
            child.removeOnAttachStateChangeListener(this)
            child.transitionAlpha = alpha
            hidden.remove(child)
        }
        // Build the stack from the bottom row upward regardless of adapter order.
        for ((child, id) in visible.entries.sortedByDescending { it.key.bottom }) {
            if (id in fallen) {
                hide(child)
                continue
            }
            if (!child.isShown || !child.isAttachedToWindow ||
                child.width <= 0 || child.height <= 0 || child.bottom <= target.paddingTop || child.top >= bottom
            ) continue
            if (id !in eligible) continue

            val content = ContentWidth(child.width).apply { include(child, 0f) }
            val left = content.left
            val width = content.width
            val height = child.height
            val image = Picture()
            val canvas = image.beginRecording(width, height)
            try {
                canvas.clipRect(0, 0, width, height)
                canvas.translate(-left.toFloat(), 0f)
                child.draw(canvas)
            } finally {
                image.endRecording()
            }
            val centerX = child.x + left + width * 0.5f
            val centerY = child.y + height * 0.5f
            val edge = width * 0.5f
            val travel = (target.width - width).coerceAtLeast(0).toFloat()
            val landing = edge + travel * (0.1f + Random.nextFloat() * 0.8f)
            pile.addLast(Row(
                image, centerX, centerY, width, height,
                (bottom - centerY).coerceAtLeast(0f), landing,
                edge, edge + travel,
            ))
            // Bound retained drawings while keeping all fallen IDs hidden on return.
            if (pile.size > 32) {
                val oldest = pile.removeFirst()
                if (grabbed === oldest) {
                    grabbed = null
                    dragging = false
                }
            }
            fallen.add(id)
            hide(child)
            added = true
        }
        return added
    }

    private fun hide(child: View) {
        if (child in hidden) return
        hidden[child] = child.transitionAlpha
        child.addOnAttachStateChangeListener(this)
        child.transitionAlpha = 0f
    }

    private fun observeTouch(window: Window): () -> Unit {
        val original = window.callback ?: return {}
        val callback = Proxy.newProxyInstance(
            javaClass.classLoader, arrayOf(Window.Callback::class.java),
        ) { _, method, arguments ->
            if (method.name == "dispatchTouchEvent" && touch(arguments?.firstOrNull() as? MotionEvent, original)) {
                true
            } else {
                try {
                    method.invoke(original, *(arguments ?: emptyArray()))
                } catch (error: InvocationTargetException) {
                    throw error.targetException
                }
            }
        } as Window.Callback
        window.callback = callback
        return { if (window.callback === callback) window.callback = original }
    }

    private fun touch(event: MotionEvent?, original: Window.Callback): Boolean {
        val target = list ?: return false
        if (event == null) return false
        target.getLocationInWindow(listLocation)
        val x = event.x - listLocation[0]
        val y = event.y - listLocation[1]
        if (event.actionMasked == MotionEvent.ACTION_DOWN) {
            grabbed = null
            dragging = false
            if (x !in 0f..target.width.toFloat() || y !in 0f..target.height.toFloat()) return false
            grabbed = pile.lastOrNull {
                abs(x - it.centerX) <= it.halfWidth() &&
                    abs(y - it.centerY) <= it.halfHeight()
            } ?: return false
            touchX = x
            touchY = y
            touchTime = event.eventTime
            flingX = 0f
            flingY = 0f
            return false
        }
        val row = grabbed ?: return false
        val density = target.resources.displayMetrics.density
        when (event.actionMasked) {
            MotionEvent.ACTION_MOVE -> {
                val step = ((event.eventTime - touchTime) / 16.67f).coerceAtLeast(0.5f)
                val dx = x - touchX
                val dy = touchY - y
                if (!dragging) {
                    if (maxOf(abs(dx), abs(dy)) < 8f * density) return false
                    if (abs(dy) > abs(dx) && event.eventTime - touchTime < 180L) {
                        grabbed = null
                        return false
                    }
                    val cancel = MotionEvent.obtain(event)
                    try {
                        cancel.action = MotionEvent.ACTION_CANCEL
                        original.dispatchTouchEvent(cancel)
                    } finally {
                        cancel.recycle()
                    }
                    dragging = true
                }
                row.x.drag(dx)
                row.fall.drag(dy)
                flingX = (dx / step).coerceIn(-32f * density, 32f * density)
                flingY = (dy / step).coerceIn(-38f * density, 38f * density)
                touchX = x
                touchY = y
                touchTime = event.eventTime
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                grabbed = null
                val handled = dragging
                dragging = false
                if (!handled) return false
                if (event.actionMasked == MotionEvent.ACTION_UP && event.eventTime - touchTime < 110L) {
                    row.x.kick(flingX)
                    row.fall.throwWith(flingY)
                    row.angle.kick((flingX / density).coerceIn(-16f, 16f))
                }
            }
        }
        layer.invalidateSelf()
        target.invalidate()
        return dragging || event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL
    }

    private fun findChat(view: View): ViewGroup? {
        if (view !is ViewGroup || !view.isShown) return null
        if (listClass.isInstance(view) && view.childCount > 0 && view.getGlobalVisibleRect(visibleBounds))
            return view
        if (recyclerClass.isInstance(view)) return null
        for (index in view.childCount - 1 downTo 0) {
            findChat(view.getChildAt(index))?.let { return it }
        }
        return null
    }

    fun reset() {
        observer?.takeIf { it.isAlive }?.removeOnPreDrawListener(this)
        observer = null
        list?.let {
            it.removeOnAttachStateChangeListener(this)
            it.overlay.remove(layer)
        }
        list = null
        for ((view, alpha) in hidden) {
            view.removeOnAttachStateChangeListener(this)
            view.transitionAlpha = alpha
        }
        hidden.clear()
        touchHook?.invoke()
        touchHook = null
        grabbed = null
        dragging = false
        eligible.clear()
        fallen.clear()
        upright.clear()
        tilt = 0f
        gyro = 0f
        pile.clear()
        previousFrame = 0L
    }

    fun dispose() {
        sensors?.unregisterListener(this)
        application.unregisterActivityLifecycleCallbacks(this)
        activity = null
        reset()
    }

    override fun onViewDetachedFromWindow(view: View) {
        if (view === list) {
            reset()
            return
        }
        hidden.remove(view)?.let { view.transitionAlpha = it }
        view.removeOnAttachStateChangeListener(this)
    }
    override fun onViewAttachedToWindow(view: View) {}
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    override fun onActivityCreated(activity: Activity, state: Bundle?) {}
    override fun onActivityStarted(activity: Activity) {}
    override fun onActivityStopped(activity: Activity) {}
    override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) {}
    override fun onActivityDestroyed(activity: Activity) {}
}

private fun randomDirection() = Random.nextFloat() * 2f - 1f

private class Row(
    val image: Picture,
    initialX: Float,
    var centerY: Float,
    val width: Int,
    val height: Int,
    initialHeight: Float,
    landingX: Float,
    minX: Float,
    maxX: Float,
) {
    val x = Spring(landingX, minX, maxX, initialX)
    val fall = Fall(initialHeight)
    val angle = Spring(randomDirection() * 12f, -32f, 32f)
    val centerX get() = x.position

    private fun halfExtent(across: Int, along: Int): Float {
        val radians = Math.toRadians(angle.position.toDouble())
        return (abs(sin(radians)) * across + abs(cos(radians)) * along).toFloat() * 0.5f
    }

    fun halfWidth() = halfExtent(height, width)
    fun halfHeight() = halfExtent(width, height)
}

/** Keep the collision box around message content, excluding the row's empty trailing space. */
private class ContentWidth(private val rowWidth: Int) {
    private var start = Float.POSITIVE_INFINITY
    private var end = Float.NEGATIVE_INFINITY
    val left get() = if (start.isFinite()) floor(start - 2f).toInt().coerceIn(0, rowWidth - 1) else 0
    val width get() = if (end.isFinite()) ceil(end + 2f).toInt().coerceIn(left + 1, rowWidth) - left else rowWidth

    fun include(view: View, x: Float) {
        if (view.visibility != View.VISIBLE || view.alpha == 0f || view.width <= 0 || view.height <= 0) return
        if (view is TextView && view.layout != null && view.compoundDrawables.all { it == null }) {
            val layout = view.layout ?: return
            for (line in 0 until layout.lineCount) {
                val origin = x + view.totalPaddingLeft - view.scrollX
                add(origin + layout.getLineLeft(line), origin + layout.getLineRight(line))
            }
        } else if (view is ViewGroup && view.childCount > 0) {
            for (index in 0 until view.childCount) {
                val child = view.getChildAt(index)
                include(child, x + child.x - view.scrollX)
            }
        } else {
            add(x, x + view.width)
        }
    }

    private fun add(left: Float, right: Float) {
        if (right <= left) return
        start = minOf(start, left)
        end = maxOf(end, right)
    }
}

private class PileDrawable(private val pile: ArrayDeque<Row>) : Drawable() {
    override fun draw(canvas: Canvas) {
        val clip = canvas.save()
        canvas.clipRect(bounds)
        for (row in pile) {
            val frame = canvas.save()
            canvas.translate(row.centerX, row.centerY)
            canvas.rotate(row.angle.position)
            canvas.translate(-row.width * 0.5f, -row.height * 0.5f)
            if (canvas.isHardwareAccelerated || !row.image.requiresHardwareAcceleration())
                canvas.drawPicture(row.image)
            canvas.restoreToCount(frame)
        }
        canvas.restoreToCount(clip)
    }

    override fun setAlpha(alpha: Int) {}
    override fun setColorFilter(colorFilter: ColorFilter?) {}
    @Suppress("OVERRIDE_DEPRECATION")
    override fun getOpacity() = PixelFormat.TRANSLUCENT
}

private class Fall(initialHeight: Float) {
    var height = initialHeight
        private set
    private var velocity = 0f

    fun launch(speed: Float) {
        velocity = maxOf(speed, velocity)
    }

    fun drag(distance: Float) {
        height = (height + distance).coerceAtLeast(0f)
        velocity = 0f
    }

    fun holdAbove(floor: Float): Boolean {
        if (height >= floor) return false
        height = floor
        return true
    }

    fun throwWith(speed: Float) {
        velocity = speed
    }

    fun advance(step: Float, density: Float, floor: Float): Boolean {
        if (height == floor && velocity == 0f) return false
        velocity -= 1.25f * density * step
        height += velocity * step
        if (height <= floor) {
            height = floor
            velocity = if (velocity < -3f * density) -velocity * 0.31f else 0f
        }
        return height > floor || velocity != 0f
    }
}

private class Spring(
    private val rest: Float,
    private val min: Float,
    private val max: Float,
    initial: Float = 0f,
) {
    var position = initial.coerceIn(min, max)
        private set
    private var velocity = 0f
    private val maxSpeed = (max - min) * 0.5f

    fun kick(amount: Float) {
        velocity = (velocity + amount).coerceIn(-maxSpeed, maxSpeed)
    }

    fun drag(distance: Float) {
        position = (position + distance).coerceIn(min, max)
        velocity = 0f
    }

    fun advance(step: Float, bias: Float = 0f): Boolean {
        val target = (rest + bias).coerceIn(min, max)
        if (abs(velocity) < 0.02f && abs(target - position) < 0.05f) {
            position = target
            velocity = 0f
            return false
        }
        velocity = (velocity + (target - position) * 0.085f * step) * exp(-0.16f * step)
        position = (position + velocity * step).coerceIn(min, max)
        return true
    }
}

/** Chat enables stable IDs. Resolve RecyclerView members by signature since R8 renames them. */
private class RowIdentities(recycler: Class<*>) {
    private val holder = recycler.declaredMethods.single { method ->
        Modifier.isStatic(method.modifiers) &&
            method.parameterTypes.contentEquals(arrayOf(View::class.java)) &&
            method.returnType.declaredFields.any { it.type == Long::class.javaPrimitiveType } &&
            method.returnType.declaredFields.any { it.type == View::class.java }
    }.apply { isAccessible = true }
    private val stableId = holder.returnType.declaredFields.single {
        !Modifier.isStatic(it.modifiers) && it.type == Long::class.javaPrimitiveType
    }.apply { isAccessible = true }
    private val adapter = recycler.getMethod("getAdapter")
    private val itemCount = adapter.returnType.declaredMethods.single {
        Modifier.isAbstract(it.modifiers) && it.parameterCount == 0 && it.returnType == Int::class.javaPrimitiveType
    }.apply { isAccessible = true }
    private val itemId = adapter.returnType.declaredMethods.single {
        it.parameterTypes.contentEquals(arrayOf(Int::class.javaPrimitiveType)) &&
            it.returnType == Long::class.javaPrimitiveType
    }.apply { isAccessible = true }

    fun id(child: View): Long? = holder.invoke(null, child)?.let(stableId::getLong)?.takeUnless { it == -1L }

    fun loadedIds(list: ViewGroup): List<Long> {
        val current = adapter.invoke(list) ?: return emptyList()
        return List(itemCount.invoke(current) as Int) { itemId.invoke(current, it) as Long }
    }
}
