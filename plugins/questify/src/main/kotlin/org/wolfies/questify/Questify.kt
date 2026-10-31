@file:JvmName("Questify")

package org.wolfies.questify

import android.util.Base64
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeAsyncMethod
import org.json.JSONObject
import java.net.URL
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.io.ByteArrayOutputStream
import javax.net.ssl.HttpsURLConnection

private const val DESKTOP_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9265 Chrome/148.0.7778.280 Electron/42.11.15 Safari/537.36"
private val snowflake = Regex("[1-9][0-9]{4,19}")

val questify = plugin {
    val connections = ConcurrentHashMap.newKeySet<HttpsURLConnection>()
    val launch = UUID.randomUUID().toString()
    val active = AtomicBoolean(false)

    start {
        active.set(true)
        registerNativeAsyncMethod("${manifest.id}.heartbeat") { args ->
            check(active.get()) { "Questify native transport is stopped." }
            val questId = args.getOrNull(0) as? String ?: error("Missing quest ID.")
            val applicationId = args.getOrNull(1) as? String ?: error("Missing application ID.")
            val terminal = args.getOrNull(2) as? Boolean ?: error("Missing terminal flag.")
            val token = args.getOrNull(3) as? String ?: error("Missing Discord session.")
            require(snowflake.matches(questId) && snowflake.matches(applicationId)) { "Invalid quest or application ID." }
            require(token.isNotBlank() && token.length <= 4096 && token.none { it == '\r' || it == '\n' }) { "Invalid Discord session." }
            val properties = JSONObject()
                .put("os", "Windows").put("browser", "Discord Client")
                .put("release_channel", "stable").put("client_version", "1.0.9265")
                .put("os_version", "10.0.26100").put("os_arch", "x64").put("app_arch", "x64")
                .put("system_locale", Locale.getDefault().toLanguageTag())
                .put("browser_user_agent", DESKTOP_AGENT).put("browser_version", "42.11.15")
                .put("os_sdk_version", "26100").put("client_build_number", 652418)
                .put("native_build_number", 96160).put("client_launch_id", launch)
                .put("client_app_state", "focused")
            val connection = URL("https://discord.com/api/v9/quests/$questId/heartbeat")
                .openConnection() as HttpsURLConnection
            connections.add(connection)
            try {
                check(active.get()) { "Questify native transport is stopped." }
                connection.apply {
                    requestMethod = "POST"
                    instanceFollowRedirects = false
                    connectTimeout = 10000
                    readTimeout = 15000
                    doOutput = true
                    setRequestProperty("Authorization", token)
                    setRequestProperty("User-Agent", DESKTOP_AGENT)
                    setRequestProperty("X-Super-Properties", Base64.encodeToString(properties.toString().toByteArray(Charsets.UTF_8), Base64.NO_WRAP))
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("Accept", "*/*")
                    setRequestProperty("Origin", "https://discord.com")
                    setRequestProperty("Referer", "https://discord.com/channels/@me")
                    setRequestProperty("Accept-Language", Locale.getDefault().toLanguageTag())
                    setRequestProperty("sec-ch-ua-platform", "\"Windows\"")
                    setRequestProperty("sec-ch-ua-mobile", "?0")
                    setRequestProperty("sec-ch-ua", "\"Not/A)Brand\";v=\"99\", \"Chromium\";v=\"148\"")
                    setRequestProperty("Sec-Fetch-Site", "same-origin")
                    setRequestProperty("Sec-Fetch-Mode", "cors")
                    setRequestProperty("Sec-Fetch-Dest", "empty")
                }
                val body = JSONObject().put("application_id", applicationId).put("terminal", terminal)
                    .toString().toByteArray(Charsets.UTF_8)
                connection.setFixedLengthStreamingMode(body.size)
                connection.outputStream.use { it.write(body) }
                val status = connection.responseCode
                val stream = if (status in 200..299) connection.inputStream else connection.errorStream
                val response = stream?.use { input ->
                    val output = ByteArrayOutputStream()
                    val buffer = ByteArray(4096)
                    var count = input.read(buffer)
                    while (count != -1) {
                        check(output.size() + count <= 65536) { "Discord quest response exceeded 64 KB." }
                        output.write(buffer, 0, count)
                        count = input.read(buffer)
                    }
                    output.toString("UTF-8")
                }.orEmpty()
                JSONObject().put("status", status).put("body", response).toString()
            } finally {
                connections.remove(connection)
                connection.disconnect()
            }
        }
    }
    stop {
        active.set(false)
        connections.forEach { it.disconnect() }
        connections.clear()
    }
}
