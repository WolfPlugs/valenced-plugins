@file:JvmName("MoreAltsPlugin")

package rosie.morealts

import android.app.Notification
import android.app.NotificationManager
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedHelpers
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod
import java.io.File

val moreAltsPlugin = plugin {
    var hook1: XC_MethodHook.Unhook? = null
    var hook2: XC_MethodHook.Unhook? = null

    start {
        val vaultFile = File(storageDir, "accounts_vault.json")
        var activeUserId: String? = null
        var blockBackground = true

        registerNativeMethod("morealts.saveAccounts") { args ->
            val json = args.getOrNull(0) as? String ?: return@registerNativeMethod false
            try {
                vaultFile.parentFile?.mkdirs()
                vaultFile.writeText(json)
                true
            } catch (_: Throwable) {
                false
            }
        }

        registerNativeMethod("morealts.loadAccounts") {
            try {
                if (vaultFile.exists()) vaultFile.readText() else "[]"
            } catch (_: Throwable) {
                "[]"
            }
        }

        registerNativeMethod("morealts.setActiveUser") { args ->
            activeUserId = args.getOrNull(0) as? String
            null
        }

        registerNativeMethod("morealts.setBlockNotifications") { args ->
            blockBackground = args.getOrNull(0) as? Boolean ?: true
            null
        }

        try {
            val hook = object : XC_MethodHook() {
                override fun beforeHookedMethod(param: MethodHookParam) {
                    if (!blockBackground) return
                    val current = activeUserId ?: return

                    val notification = param.args.firstOrNull { it is Notification } as? Notification ?: return
                    val extras = notification.extras ?: return

                    val notifUserId = extras.getString("account_id")
                        ?: extras.getString("user_id")
                        ?: extras.getString("recipient_id")
                        ?: extras.getString("discord_user_id")

                    val tag = param.args.firstOrNull { it is String } as? String

                    if (notifUserId != null && notifUserId != current) {
                        param.result = null
                        return
                    }

                    if (tag != null && tag.contains("account") && !tag.contains(current)) {
                        param.result = null
                        return
                    }
                }
            }

            hook1 = XposedHelpers.findAndHookMethod(
                NotificationManager::class.java,
                "notify",
                String::class.java,
                Int::class.javaPrimitiveType,
                Notification::class.java,
                hook
            )

            hook2 = XposedHelpers.findAndHookMethod(
                NotificationManager::class.java,
                "notify",
                Int::class.javaPrimitiveType,
                Notification::class.java,
                hook
            )
        } catch (_: Throwable) {
        }
    }

    stop {
        hook1?.unhook()
        hook2?.unhook()
        hook1 = null
        hook2 = null
    }
}
