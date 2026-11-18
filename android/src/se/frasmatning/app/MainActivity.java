package se.frasmatning.app;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.View;
import android.view.Window;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/** Visar webbappen (assets/index.html) i en WebView. */
public class MainActivity extends Activity {
    // Sidan får en https-adress så att localStorage, Web Workers och OCR fungerar som i en webbläsare.
    private static final String BASE = "https://frasmatning.app/";
    private static final int PICK_IMAGE = 1;

    private WebView web;
    private ValueCallback<Uri[]> pending;
    private Uri cameraUri;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        int bg = night ? 0xff121512 : 0xffeef0ec;
        Window w = getWindow();
        w.setStatusBarColor(bg);
        w.setNavigationBarColor(bg);
        if (!night) {
            // Mörka ikoner i statusraden (0x2000) och navigeringsfältet (0x10, API 26+)
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | 0x10);
        }

        web = new WebView(this);
        web.setBackgroundColor(bg);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);

        web.setWebViewClient(new WebViewClient() {
            // Den äldre varianten (String) anropas även på nyare Android
            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith(BASE) || url.startsWith("about:") || url.startsWith("blob:") || url.startsWith("data:")) return false;
                Uri u = Uri.parse(url);
                // Externa länkar öppnas i webbläsaren
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* ingen app */ }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pending != null) pending.onReceiveValue(null);
                pending = callback;
                return openPicker();
            }
        });

        web.loadDataWithBaseURL(BASE, readAsset("index.html"), "text/html", "utf-8", null);
    }

    /** Väljare med kamera och bildgalleri. */
    private boolean openPicker() {
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType("image/*");
        Intent chooser = Intent.createChooser(pick, "Fota etiketten");

        deleteCameraPhoto();
        try {
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.Images.Media.DISPLAY_NAME, "frasetikett_" + System.currentTimeMillis() + ".jpg");
            cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
            if (cameraUri != null) {
                Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { cam });
            }
        } catch (Exception e) {
            cameraUri = null; // utan lagringsbehörighet på äldre Android: bara galleriet
        }

        try {
            startActivityForResult(chooser, PICK_IMAGE);
            return true;
        } catch (Exception e) {
            pending.onReceiveValue(null);
            pending = null;
            return false;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != PICK_IMAGE || pending == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getData() != null) {
                result = new Uri[] { data.getData() };
                deleteCameraPhoto(); // galleriet valdes, kamerans tomma post behövs inte
            } else if (cameraUri != null) {
                result = new Uri[] { cameraUri };
            }
        } else {
            deleteCameraPhoto();
        }
        pending.onReceiveValue(result);
        pending = null;
    }

    /** Tar bort bilden appen själv tog förra gången, så galleriet inte fylls med etikettfoton. */
    private void deleteCameraPhoto() {
        if (cameraUri == null) return;
        try { getContentResolver().delete(cameraUri, null, null); } catch (Exception e) { /* redan borta */ }
        cameraUri = null;
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (isFinishing()) deleteCameraPhoto();
        super.onDestroy();
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (Exception e) {
            return "<p>Kunde inte läsa appen: " + e + "</p>";
        }
    }
}
