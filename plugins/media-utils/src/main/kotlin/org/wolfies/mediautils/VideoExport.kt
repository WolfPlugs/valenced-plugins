package org.wolfies.mediautils

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import java.io.File
import java.nio.ByteBuffer
import java.lang.reflect.Modifier

/** Finalize WebView's fragmented MP4 into the seekable MP4 expected by Discord. */
internal fun finalizeVideo(context: Context, value: String): String {
    val uri = Uri.parse(value)
    require(uri.scheme == "file") { "Expected a local edited video." }
    val input = File(requireNotNull(uri.path)).canonicalFile
    val editorCache = File(context.cacheDir, "media-utils").canonicalFile
    require(input.parentFile == editorCache && input.extension in setOf("mp4", "webm") && input.isFile) { "Expected a MediaUtils video export." }
    require(input.length() in 1..(64L * 1024 * 1024)) { "Invalid edited video size." }
    if (input.extension == "webm") return videoUploadUri(context, input).toString()
    val output = File.createTempFile("media-utils-upload-", ".mp4", editorCache)
    val extractor = MediaExtractor()
    var muxer: MediaMuxer? = null
    var complete = false
    try {
        extractor.setDataSource(input.path)
        val writer = MediaMuxer(output.path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        muxer = writer
        val tracks = mutableMapOf<Int, Int>()
        var hasVideo = false
        for (index in 0 until extractor.trackCount) {
            val format = extractor.getTrackFormat(index)
            val mime = format.getString(MediaFormat.KEY_MIME).orEmpty()
            if (!mime.startsWith("video/") && !mime.startsWith("audio/")) continue
            hasVideo = hasVideo || mime.startsWith("video/")
            tracks[index] = writer.addTrack(format)
            extractor.selectTrack(index)
        }
        require(hasVideo) { "The edited video has no readable video track." }
        writer.start()
        val buffer = ByteBuffer.allocateDirect(8 * 1024 * 1024)
        val info = MediaCodec.BufferInfo()
        var samples = 0
        while (true) {
            buffer.clear()
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0) break
            require(size <= buffer.capacity()) { "An edited video frame exceeds the supported size." }
            val track = tracks[extractor.sampleTrackIndex] ?: error("Unexpected edited video track.")
            info.set(0, size, extractor.sampleTime.coerceAtLeast(0),
                if (extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0)
            writer.writeSampleData(track, buffer, info)
            samples++
            extractor.advance()
        }
        require(samples > 0) { "The edited video contains no frames." }
        writer.stop()
        val result = videoUploadUri(context, output)
        complete = true
        return result.toString()
    } finally {
        extractor.release()
        try { muxer?.release() } finally { if (!complete) output.delete() }
    }
}

private fun videoUploadUri(context: Context, file: File): Uri {
    val authority = "${context.packageName}.imagepickerprovider"
    val provider = requireNotNull(context.packageManager.resolveContentProvider(authority, 0)) {
        "Discord's image picker file provider is unavailable."
    }
    val type = Class.forName(provider.name, false, context.classLoader)
    // Discord obfuscates the method name. Match FileProvider's public API signature.
    val method = type.methods.single {
        Modifier.isStatic(it.modifiers) && it.returnType == Uri::class.java &&
            it.parameterTypes.contentEquals(arrayOf(Context::class.java, String::class.java, File::class.java))
    }
    val uri = method.invoke(null, context, authority, file) as Uri
    context.contentResolver.openAssetFileDescriptor(uri, "r")?.use {
        require(it.length == file.length()) { "Discord could not read the edited video." }
    } ?: error("Discord could not open the edited video.")
    return uri
}
