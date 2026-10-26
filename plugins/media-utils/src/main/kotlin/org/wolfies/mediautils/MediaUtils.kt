@file:JvmName("MediaUtils")
package org.wolfies.mediautils

import android.app.Activity
import android.app.Application
import android.content.Context
import android.net.Uri
import android.util.Base64
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod
import app.valenced.xposed.api.registerNativeAsyncMethod
import java.util.WeakHashMap
import java.util.concurrent.Executors

// Text, paint, and emoji editing are temporarily disabled.
private const val OVERLAYS_ENABLED = false

val mediaUtils = plugin {
    val main = Handler(Looper.getMainLooper())
    val sessions = WeakHashMap<Activity, NativeEditor>()
    var application: Application? = null
    var fileContext: Context? = null
    var active = false
    var emojis = emptyList<Pair<String, String>>()
    var workers = Executors.newFixedThreadPool(2)
    var report: (Throwable) -> Unit = {}
    fun attach(activity: Activity, attempt: Int = 0) {
        if (!OVERLAYS_ENABLED || !active || activity.isFinishing || activity.isDestroyed || sessions.containsKey(activity)) return
        if (!activity.intent.hasExtra("com.yalantis.ucrop.InputUri") || !activity.intent.hasExtra("com.yalantis.ucrop.OutputUri")) return
        try {
            val editor = NativeEditor.attach(activity, { emojis }, workers, report)
            if (editor != null) sessions[activity] = editor
            else if (attempt < 40) main.postDelayed({ attach(activity, attempt + 1) }, 150)
            else report(IllegalStateException("MediaUtils could not find the crop editor's bitmap."))
        } catch (error: Throwable) { report(error) }
    }
    val lifecycle = object : Application.ActivityLifecycleCallbacks {
        override fun onActivityResumed(activity: Activity) { main.post { attach(activity) } }
        override fun onActivityDestroyed(activity: Activity) { sessions.remove(activity)?.close() }
        override fun onActivityCreated(activity: Activity, state: Bundle?) {}
        override fun onActivityStarted(activity: Activity) {}
        override fun onActivityPaused(activity: Activity) {}
        override fun onActivityStopped(activity: Activity) {}
        override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) {}
    }
    start {
        active = true
        if (workers.isShutdown) workers = Executors.newFixedThreadPool(2)
        report = { errors.tryEmit(it) }
        registerNativeMethod("${manifest.id}.emojis") { args ->
            emojis = (args.firstOrNull() as? List<*>)?.take(2000)?.mapNotNull {
                val item = it as? Map<*, *> ?: return@mapNotNull null
                val id = item["id"] as? String ?: return@mapNotNull null
                val name = item["name"] as? String ?: return@mapNotNull null
                if (id.matches(Regex("[0-9]{1,24}"))) id to name.take(80) else null
            }.orEmpty()
            true
        }
        withAppContext { context -> fileContext = context }
        registerNativeAsyncMethod("${manifest.id}.readMedia") { args ->
            val value = args.firstOrNull() as? String ?: error("Missing attachment URI.")
            val uri = Uri.parse(value)
            require(uri.scheme == "content") { "Expected an Android content URI." }
            val context = fileContext ?: error("Android file access is not ready.")
            val bytes = context.contentResolver.openInputStream(uri)?.use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(64 * 1024)
                var count = input.read(buffer)
                while (count != -1) {
                    require(output.size().toLong() + count <= 64L * 1024 * 1024) { "This editor supports attachments up to 64 MB." }
                    output.write(buffer, 0, count)
                    count = input.read(buffer)
                }
                output.toByteArray()
            } ?: error("Android could not open this attachment.")
            Base64.encodeToString(bytes, Base64.NO_WRAP)
        }
        withAppActivity { activity ->
            main.post {
                if (active && application == null) {
                    val app = activity.application
                    application = app
                    fileContext = app
                    app.registerActivityLifecycleCallbacks(lifecycle)
                }
                attach(activity)
            }
        }
    }
    stop {
        active = false
        application?.unregisterActivityLifecycleCallbacks(lifecycle)
        application = null
        fileContext = null
        main.removeCallbacksAndMessages(null)
        main.post { sessions.values.toList().forEach { it.close() }; sessions.clear() }
        workers.shutdownNow()
    }
}
