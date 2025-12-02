package com.candel.candel_overtime

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.PluginMethod
import java.io.File
import java.io.FileOutputStream

@CapacitorPlugin(name = "MediaStoreSaver")
class MediaStoreSaver : Plugin() {

    @PluginMethod
    fun saveFile(call: PluginCall) {
        val base64 = call.getString("base64") ?: run {
            call.reject("base64 is required"); return
        }
        val fileName = call.getString("fileName") ?: "output.bin"
        val mime = call.getString("mimeType") ?: "application/octet-stream"

        try {
            val bytes = Base64.decode(base64, Base64.DEFAULT)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val resolver = context.contentResolver
                val contentValues = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                    put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
                if (uri == null) {
                    call.reject("Failed to create MediaStore entry")
                    return
                }
                resolver.openOutputStream(uri).use { out ->
                    if (out == null) {
                        call.reject("Failed to open output stream")
                        return
                    }
                    out.write(bytes)
                    out.flush()
                }
                val result = HashMap<String, Any>()
                result["uri"] = uri.toString()
                call.resolve(result)
                return
            } else {
                // Pre-Q: write to Downloads directory
                val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                if (!downloads.exists()) downloads.mkdirs()
                val outFile = File(downloads, fileName)
                FileOutputStream(outFile).use { fos ->
                    fos.write(bytes)
                    fos.flush()
                }
                val result = HashMap<String, Any>()
                result["path"] = outFile.absolutePath
                call.resolve(result)
                return
            }
        } catch (e: Exception) {
            call.reject("Save failed: ${e.message}", e)
            return
        }
    }
}
