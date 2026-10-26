@file:JvmName("NsfwBlur")

package org.wolfies.nsfwblur

import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod
import org.luckypray.dexkit.wrap.DexField
import java.util.WeakHashMap

private const val LABEL = "Tap to reveal"
private val main = Handler(Looper.getMainLooper())
@Volatile private var strength = 24f

private fun descendants(view: View): Sequence<View> = sequence {
    yield(view)
    if (view is ViewGroup) {
        for (index in 0 until view.childCount) yieldAll(descendants(view.getChildAt(index)))
    }
}

val nsfwBlur = plugin {
    val hooks = mutableListOf<XC_MethodHook.Unhook>()
    val overlays = WeakHashMap<View, View.OnClickListener?>()
    val infoRows = WeakHashMap<View, Int>()
    var active = false
    var restore: ((View, View.OnClickListener?) -> Unit)? = null

    start {
        // R8 inlines ObscureOverlayView.configure into this caller.
        val configure = requireNotNull(dexFinder.findMethod {
            matcher {
                usingStrings("viewToBlur", "onReveal()V", "onHide()V")
                paramCount = 2
                returnType = "void"
            }
        }) { "Spoiler configuration method not found" }
        val overlayView = requireNotNull(dexFinder.findMethod {
            matcher {
                usingStrings("blurView")
                paramCount = 0
                returnType = "android.view.View"
            }
        }) { "Obscure overlay accessor not found" }
        val overlayClass = overlayView.declaringClass
        val revealFields = requireNotNull(dexFinder.findValue(
            "reveal-button-fields-v1",
            { fields -> fields.joinToString("|") { it.descriptor } },
            { encoded -> encoded.split('|').map { DexField(it).getFieldInstance(classLoader).apply { isAccessible = true } } },
        ) {
            val method = findMethod {
                matcher {
                    declaredClass = overlayClass.name
                    usingStrings("revealButton")
                    paramTypes("boolean")
                    returnType = "void"
                }
            }.singleOrNull() ?: return@findValue null
            method.usingFields.map { it.field }.distinctBy { it.descriptor }
                .sortedBy { if (it.declaredClassName == overlayClass.name) 0 else 1 }
                .also { check(it.size == 2) { "Unexpected reveal button binding" } }
        }) { "Reveal button binding not found" }
        val blurClass = requireNotNull(dexFinder.findClass {
            matcher { usingStrings("BlurView can't be used in not hardware-accelerated window!") }
        }) { "Blur view not found" }
        val setup = requireNotNull(dexFinder.findMethod {
            matcher {
                declaredClass = blurClass.name
                paramTypes("android.view.ViewGroup")
            }
        }) { "Blur controller setup not found" }
        val controllerClass = setup.returnType
        val controllerField = blurClass.declaredFields.single {
            it.type.isAssignableFrom(controllerClass)
        }.apply { isAccessible = true }
        val radius = requireNotNull(dexFinder.findMethod {
            matcher {
                declaredClass = controllerClass.name
                paramTypes("float")
            }
        }) { "Blur radius setter not found" }
        val color = requireNotNull(dexFinder.findMethod {
            matcher {
                declaredClass = controllerClass.name
                paramTypes("int")
            }
        }) { "Blur overlay color setter not found" }
        val nestedClick = requireNotNull(dexFinder.findMethod {
            matcher {
                paramTypes("android.view.View", "boolean", "android.view.View\$OnClickListener")
                returnType = "void"
                invokeMethods {
                    add {
                        declaredClass = "android.view.View"
                        name = "setOnTouchListener"
                    }
                }
            }
        }) { "Nested click setter not found" }
        val clickTag = requireNotNull(dexFinder.findValue(
            "nested-click-tag-v1", Int::toString, String::toInt,
        ) {
            getMethodData(nestedClick)?.usingNumbers?.map { it.intValue() }?.singleOrNull { it < 0 }
        }) { "Nested click listener tag not found" }
        // R8 also inlines InfoLinkView.configure into the message accessory binder.
        val infoAccessory = requireNotNull(dexFinder.findClass {
            matcher { usingStrings("InfoLinkMessageAccessory(messageId=") }
        }) { "Info link accessory not found" }
        val bindAccessory = requireNotNull(dexFinder.findMethod {
            matcher {
                usingStrings("text", "icon", "eventHandler")
                paramCount = 2
                returnType = "void"
                usingFields { add { field { declaredClass = infoAccessory.name } } }
            }
        }) { "Info link accessory binder not found" }
        val accessories = requireNotNull(dexFinder.findField {
            matcher {
                declaredClass = bindAccessory.declaringClass.name
                type = "java.util.List"
            }
        }) { "Message accessory list not found" }

        fun applyBlur(view: View, requested: Float, overlayColor: Int) {
            val controller = controllerField.get(view)
            radius.invoke(controller, requested)
            color.invoke(controller, overlayColor)
            view.invalidate()
        }
        restore = { view, listener ->
            nestedClick.invoke(null, view, false, listener)
            applyBlur(view, 24f, 0x50000000)
        }
        active = true
        hooks += XposedBridge.hookMethod(bindAccessory, object : XC_MethodHook() {
            override fun afterHookedMethod(param: MethodHookParam) {
                if (!active || param.hasThrowable()) return
                try {
                    val items = accessories.get(param.thisObject) as List<*>
                    val index = param.args.getOrNull(1) as? Int ?: return
                    if (!infoAccessory.isInstance(items.getOrNull(index))) return
                    val holder = param.args[0] ?: return
                    val view = holder.javaClass.declaredFields.single {
                        View::class.java.isAssignableFrom(it.type)
                    }.apply { isAccessible = true }.get(holder) as View
                    if (descendants(view).filterIsInstance<TextView>().all { it.text.isNullOrEmpty() }) {
                        if (!infoRows.containsKey(view)) infoRows[view] = view.visibility
                        view.visibility = View.GONE
                    } else {
                        infoRows.remove(view)?.let { view.visibility = it }
                    }
                } catch (error: Throwable) {
                    errors.tryEmit(error)
                }
            }
        })
        hooks += XposedBridge.hookMethod(configure, object : XC_MethodHook() {
            override fun afterHookedMethod(param: MethodHookParam) {
                if (!active || param.hasThrowable()) return
                val root = param.thisObject as? View ?: return
                try {
                    for (overlay in descendants(root).filter { overlayClass.isInstance(it) }) {
                        val blur = overlayView.invoke(overlay) as View
                        val ours = overlay.visibility == View.VISIBLE && descendants(overlay).any {
                            it is TextView && (it.text.toString() == LABEL || it.contentDescription?.toString() == LABEL)
                        }
                        if (!ours) {
                            if (overlays.containsKey(blur)) nestedClick.invoke(null, blur, false, overlays.remove(blur))
                            continue
                        }
                        val reveal = revealFields.fold(overlay as Any) { value, field -> field.get(value) }
                        val target = descendants(reveal as View).first { it.getTag(clickTag) is View.OnClickListener }
                        val onReveal = target.getTag(clickTag) as View.OnClickListener
                        if (!overlays.containsKey(blur)) overlays[blur] = blur.getTag(clickTag) as? View.OnClickListener
                        nestedClick.invoke(null, blur, false, View.OnClickListener { view ->
                            if (active && view.visibility == View.VISIBLE) onReveal.onClick(target)
                        })
                        applyBlur(blur, strength, 0)
                    }
                } catch (error: Throwable) {
                    errors.tryEmit(error)
                }
            }
        })
        registerNativeMethod("${manifest.id}.configure") { args ->
            check(active) { "NSFW blur is stopped" }
            val requested = args.firstOrNull() as? Number ?: error("Blur strength must be a number")
            val value = requested.toFloat().also { require(it.isFinite()) }.coerceIn(1f, 25f)
            strength = value
            main.post {
                if (active) overlays.keys.toList().forEach { view ->
                    try { applyBlur(view, value, 0) }
                    catch (error: Throwable) { errors.tryEmit(error) }
                }
            }
            true
        }
    }

    stop {
        active = false
        hooks.forEach { it.unhook() }
        hooks.clear()
        val reset = restore
        main.post {
            overlays.entries.toList().forEach { (view, listener) ->
                try { reset?.invoke(view, listener) }
                catch (error: Throwable) { errors.tryEmit(error) }
            }
            overlays.clear()
            infoRows.entries.toList().forEach { (view, visibility) -> view.visibility = visibility }
            infoRows.clear()
        }
        restore = null
        requireReload()
    }
}
