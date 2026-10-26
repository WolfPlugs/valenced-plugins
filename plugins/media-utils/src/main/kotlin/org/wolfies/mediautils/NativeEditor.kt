package org.wolfies.mediautils

import android.app.Activity
import android.app.AlertDialog
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutorService
import kotlin.math.hypot

class NativeEditor private constructor(
    private val activity: Activity,
    private val root: ViewGroup,
    private val image: ImageView,
    source: Bitmap,
    private val emojis: () -> List<Pair<String, String>>,
    private val workers: ExecutorService,
    private val report: (Throwable) -> Unit,
) {
    private val bitmap = requireNotNull(source.copy(Bitmap.Config.ARGB_8888, true))
    private val canvas = Canvas(bitmap)
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val bar = LinearLayout(activity).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; setBackgroundColor(0xe6202225.toInt()) }
    private var previous: Bitmap? = null
    private var tool = "Crop"
    private var color = Color.WHITE
    private var alive = true
    private var layer: ((Canvas, Float, Float) -> Unit)? = null
    private var layerX = bitmap.width / 2f
    private var layerY = bitmap.height / 2f
    private var lastX = 0f
    private var lastY = 0f
    private val dialogs = mutableListOf<AlertDialog>()
    private val stickers = mutableListOf<Bitmap>()
    private val touch = object : View(activity) {
        override fun onTouchEvent(event: MotionEvent): Boolean {
            if (tool == "Crop" || !alive) return false
            try {
                if (event.actionMasked == MotionEvent.ACTION_DOWN) {
                    val visible = android.graphics.Rect()
                    if (!image.getGlobalVisibleRect(visible) || !visible.contains(event.rawX.toInt(), event.rawY.toInt())) return false
                }
                val location = IntArray(2)
                image.getLocationOnScreen(location)
                val point = floatArrayOf(event.rawX - location[0] - image.paddingLeft, event.rawY - location[1] - image.paddingTop)
                val inverse = Matrix()
                if (!image.imageMatrix.invert(inverse)) return false
                inverse.mapPoints(point)
                val x = point[0].coerceIn(0f, bitmap.width.toFloat())
                val y = point[1].coerceIn(0f, bitmap.height.toFloat())
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        if (tool == "Paint") { layer = null; snapshot(); stroke(x, y, x + 0.1f, y + 0.1f) }
                        lastX = x; lastY = y
                        parent.requestDisallowInterceptTouchEvent(true)
                    }
                    MotionEvent.ACTION_MOVE -> {
                        if (tool == "Paint") stroke(lastX, lastY, x, y)
                        else if (layer != null) { layerX += x - lastX; layerY += y - lastY; renderLayer() }
                        lastX = x; lastY = y
                    }
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> parent.requestDisallowInterceptTouchEvent(false)
                }
                image.invalidate()
                return true
            } catch (error: Throwable) { report(error); return false }
        }
    }
    init {
        val matrix = Matrix(image.imageMatrix)
        image.setImageBitmap(bitmap)
        image.imageMatrix = matrix
        root.addView(touch, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        for (label in listOf("Crop", "Paint", "Text", "Emoji", "Undo")) {
            val button = Button(activity).apply {
                text = label; isAllCaps = false; textSize = 12f; setTextColor(Color.WHITE)
                minimumWidth = 0; minWidth = 0; setPadding(dp(3), 0, dp(3), 0)
                setBackgroundColor(Color.TRANSPARENT)
                setOnClickListener { try { action(label) } catch (error: Throwable) { report(error) } }
                if (label == "Paint") setOnLongClickListener { colors(); true }
            }
            bar.addView(button, LinearLayout.LayoutParams(0, dp(44), 1f))
        }
        val params = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(44), Gravity.BOTTOM).apply { bottomMargin = dp(100) }
        root.addView(bar, params)
        select("Crop")
    }
    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()
    private fun snapshot() { previous?.recycle(); previous = bitmap.copy(Bitmap.Config.ARGB_8888, false) }
    private fun select(value: String) {
        tool = value
        touch.isClickable = value != "Crop"
        for (i in 0 until bar.childCount) (bar.getChildAt(i) as? Button)?.apply { alpha = if (text.toString() == value) 1f else 0.6f }
    }
    private fun stroke(x1: Float, y1: Float, x2: Float, y2: Float) {
        val values = FloatArray(9); image.imageMatrix.getValues(values)
        val scale = hypot(values[Matrix.MSCALE_X], values[Matrix.MSKEW_Y]).coerceAtLeast(0.01f)
        paint.style = Paint.Style.STROKE; paint.color = color; paint.strokeWidth = dp(5) / scale
        canvas.drawLine(x1, y1, x2, y2, paint)
    }
    private fun renderLayer() {
        val base = previous ?: return
        canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
        canvas.drawBitmap(base, 0f, 0f, null)
        layer?.invoke(canvas, layerX, layerY)
        image.invalidate()
    }
    private fun center() { layerX = bitmap.width / 2f; layerY = bitmap.height / 2f }
    private fun action(label: String) {
        when (label) {
            "Crop", "Paint" -> { layer = null; select(label) }
            "Text" -> {
                val input = EditText(activity).apply { hint = "Text or emoji" }
                show(AlertDialog.Builder(activity).setTitle("Add text").setView(input).setNegativeButton("Cancel", null).setPositiveButton("Add") { _, _ ->
                    val text = input.text.toString().take(500)
                    if (text.isNotBlank() && alive) {
                        snapshot(); center(); val textColor = color
                        val size = bitmap.width / 12f
                        layer = { target, x, y ->
                            val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = size; textAlign = Paint.Align.CENTER; typeface = android.graphics.Typeface.DEFAULT_BOLD; strokeWidth = size / 14 }
                            p.style = Paint.Style.STROKE; p.color = Color.BLACK; target.drawText(text, x, y, p)
                            p.style = Paint.Style.FILL; p.color = textColor; target.drawText(text, x, y, p)
                        }
                        select("Move"); renderLayer()
                    }
                }.create())
            }
            "Emoji" -> emojiPicker()
            "Undo" -> {
                layer = null
                previous?.let { canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR); canvas.drawBitmap(it, 0f, 0f, null); it.recycle() }
                previous = null; image.invalidate(); select("Crop")
            }
        }
    }
    private fun colors() {
        val names = arrayOf("White", "Black", "Red", "Yellow", "Green", "Blue", "Pink")
        val values = intArrayOf(Color.WHITE, Color.BLACK, 0xffed4245.toInt(), 0xfffee75c.toInt(), 0xff57f287.toInt(), 0xff5865f2.toInt(), 0xffeb459e.toInt())
        show(AlertDialog.Builder(activity).setTitle("Paint color").setItems(names) { _, index -> color = values[index]; layer = null; select("Paint") }.create())
    }
    private fun emojiPicker() {
        val layout = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(12), dp(4), dp(12), dp(4)) }
        val search = EditText(activity).apply { hint = "Search server emojis" }
        val items = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
        val scroll = ScrollView(activity).apply { addView(items) }
        layout.addView(search); layout.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(320)))
        val dialog = AlertDialog.Builder(activity).setTitle("Discord emoji").setView(layout).setNegativeButton("Close", null).create()
        fun populate(query: String) {
            items.removeAllViews()
            val matching = emojis().filter { it.second.contains(query, true) }.take(100)
            if (matching.isEmpty()) items.addView(TextView(activity).apply { text = "No server emojis loaded. You can also enter a Unicode emoji using Text." })
            matching.forEach { (id, name) ->
                items.addView(Button(activity).apply { text = name; isAllCaps = false; setOnClickListener {
                    isEnabled = false
                    workers.submit {
                        try {
                            val connection = URL("https://cdn.discordapp.com/emojis/$id.png?size=128").openConnection() as HttpURLConnection
                            connection.connectTimeout = 10000; connection.readTimeout = 10000
                            val sticker = try { connection.inputStream.use { requireNotNull(BitmapFactory.decodeStream(it)) } } finally { connection.disconnect() }
                            activity.runOnUiThread {
                                if (!alive) { sticker.recycle(); return@runOnUiThread }
                                stickers.add(sticker); snapshot(); center()
                                val size = bitmap.width / 5f
                                layer = { target, x, y -> target.drawBitmap(sticker, null, android.graphics.RectF(x - size / 2, y - size / 2, x + size / 2, y + size / 2), Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)) }
                                select("Move"); renderLayer(); dialog.dismiss()
                            }
                        } catch (error: Throwable) { activity.runOnUiThread { if (alive) { isEnabled = true; report(error) } } }
                    }
                } })
            }
        }
        search.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(text: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(text: CharSequence?, start: Int, before: Int, count: Int) { populate(text?.toString().orEmpty()) }
            override fun afterTextChanged(text: Editable?) {}
        })
        populate(""); show(dialog)
    }
    private fun show(dialog: AlertDialog) { dialogs.add(dialog); dialog.setOnDismissListener { dialogs.remove(dialog) }; dialog.show() }
    fun close() {
        alive = false; layer = null
        dialogs.toList().forEach { it.dismiss() }; dialogs.clear()
        root.removeView(bar); root.removeView(touch)
        previous?.recycle(); previous = null
        stickers.forEach { it.recycle() }; stickers.clear()
    }
    companion object {
        private fun descendants(view: View): Sequence<View> = sequence {
            yield(view)
            if (view is ViewGroup) for (i in 0 until view.childCount) yieldAll(descendants(view.getChildAt(i)))
        }
        private fun bitmap(drawable: Drawable?): Bitmap? {
            if (drawable is BitmapDrawable) return drawable.bitmap
            if (drawable == null) return null
            var type: Class<*>? = drawable.javaClass
            while (type != null && type != Drawable::class.java) {
                val fields = type.declaredFields.filter { it.type == Bitmap::class.java }
                if (fields.size == 1) return fields[0].apply { isAccessible = true }.get(drawable) as? Bitmap
                type = type.superclass
            }
            return null
        }
        fun attach(activity: Activity, emojis: () -> List<Pair<String, String>>, workers: ExecutorService, report: (Throwable) -> Unit): NativeEditor? {
            val root = activity.findViewById<ViewGroup>(android.R.id.content) ?: return null
            val target = descendants(root).filterIsInstance<ImageView>().mapNotNull { image -> bitmap(image.drawable)?.takeIf { it.width > 64 && it.height > 64 && image.width > 100 && image.height > 100 }?.let { image to it } }.maxByOrNull { it.first.width.toLong() * it.first.height } ?: return null
            return NativeEditor(activity, root, target.first, target.second, emojis, workers, report)
        }
    }
}
