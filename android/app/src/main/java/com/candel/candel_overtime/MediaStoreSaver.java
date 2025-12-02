package com.candel.candel_overtime;

import android.content.ContentValues;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.HashMap;

@CapacitorPlugin(name = "MediaStoreSaver")
public class MediaStoreSaver extends Plugin {

    public void saveFile(PluginCall call) {
        String base64 = call.getString("base64");
        if (base64 == null) { call.reject("base64 is required"); return; }
        String fileName = call.getString("fileName");
        if (fileName == null) fileName = "output.bin";
        String mime = call.getString("mimeType");
        if (mime == null) mime = "application/octet-stream";

        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                android.content.ContentResolver resolver = getContext().getContentResolver();
                ContentValues contentValues = new ContentValues();
                contentValues.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                contentValues.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                contentValues.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                android.net.Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues);
                if (uri == null) {
                    call.reject("Failed to create MediaStore entry");
                    return;
                }
                OutputStream out = resolver.openOutputStream(uri);
                if (out == null) { call.reject("Failed to open output stream"); return; }
                try {
                    out.write(bytes);
                    out.flush();
                } finally {
                    out.close();
                }
                JSObject res = new JSObject();
                res.put("uri", uri.toString());
                // Try to open the saved file using a chooser so user can view it immediately
                try {
                    android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_VIEW);
                    intent.setDataAndType(uri, mime);
                    intent.addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION | android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                    android.content.Intent chooser = android.content.Intent.createChooser(intent, "Open saved file");
                    getActivity().startActivity(chooser);
                } catch (Exception e) {
                    // non-fatal — still resolve with uri
                }
                call.resolve(res);
                return;
            } else {
                File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!downloads.exists()) downloads.mkdirs();
                File outFile = new File(downloads, fileName);
                FileOutputStream fos = new FileOutputStream(outFile);
                try {
                    fos.write(bytes);
                    fos.flush();
                } finally {
                    fos.close();
                }
                JSObject res = new JSObject();
                res.put("path", outFile.getAbsolutePath());
                try {
                    android.net.Uri contentUri = androidx.core.content.FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", outFile);
                    android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_VIEW);
                    intent.setDataAndType(contentUri, mime);
                    intent.addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION | android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                    android.content.Intent chooser = android.content.Intent.createChooser(intent, "Open saved file");
                    getActivity().startActivity(chooser);
                } catch (Exception e) {
                    // ignore
                }
                call.resolve(res);
                return;
            }
        } catch (Exception e) {
            call.reject("Save failed: " + e.getMessage(), e);
            return;
        }
    }
}
