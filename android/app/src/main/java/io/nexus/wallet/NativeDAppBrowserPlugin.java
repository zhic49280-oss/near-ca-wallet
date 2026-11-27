package io.nexus.wallet;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.Set;

import org.json.JSONObject;

@CapacitorPlugin(name = "NativeDAppBrowser")
public class NativeDAppBrowserPlugin extends Plugin {

    private static final String WEB_MESSAGE_BRIDGE_NAME = "NexusAndroidWebMessage";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private LinearLayout overlayRoot;
    private WebView dappWebView;
    private TextView urlView;
    private Button backButton;
    private Button forwardButton;
    private String injectedScriptSource = "";
    private String guardedInjectedScript = "";
    private String bridgeSessionToken = "";
    private boolean documentStartRegistered = false;
    private boolean webMessageListenerRegistered = false;

    private static boolean isAllowedDAppUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) return false;
        try {
            Uri uri = Uri.parse(rawUrl.trim());
            String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";
            String host = uri.getHost() != null ? uri.getHost().toLowerCase() : "";
            if ("https".equals(scheme)) return !host.isEmpty();
            if ("http".equals(scheme) && ("localhost".equals(host) || "127.0.0.1".equals(host))) return true;
        } catch (Exception ignored) {
        }
        return false;
    }

    private static String originString(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) return null;
        try {
            Uri uri = Uri.parse(rawUrl.trim());
            String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";
            String host = uri.getHost() != null ? uri.getHost().toLowerCase() : "";
            if (scheme.isEmpty() || host.isEmpty()) return null;
            int port = uri.getPort();
            boolean isDefaultPort = (port == -1) || ("https".equals(scheme) && port == 443) || ("http".equals(scheme) && port == 80);
            return isDefaultPort ? (scheme + "://" + host) : (scheme + "://" + host + ":" + port);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String generateBridgeToken() {
        byte[] bytes = new byte[24];
        new SecureRandom().nextBytes(bytes);
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    private static String buildMainFrameGuardedScript(String rawScript, String token) {
        if (rawScript == null || rawScript.isEmpty()) return "";
        return "(function(){"
                + "try{if(window.self!==window.top)return;}catch(_){return;}"
                + "var __NEXUS_ANDROID_BRIDGE_TOKEN__=" + JSONObject.quote(token != null ? token : "") + ";"
                + rawScript
                + "\n})();";
    }

    private int dp(int value) {
        Activity act = getActivity();
        float density = act != null ? act.getResources().getDisplayMetrics().density : 2.0f;
        return Math.round(value * density);
    }

    private int getStatusBarTopInset(Activity act) {
        try {
            int resId = act.getResources().getIdentifier("status_bar_height", "dimen", "android");
            if (resId > 0) return act.getResources().getDimensionPixelSize(resId);
        } catch (Exception ignored) {
        }
        return dp(24);
    }

    private Button makeToolbarButton(Activity act, String label, View.OnClickListener listener) {
        Button btn = new Button(act);
        btn.setText(label);
        btn.setTextColor(Color.WHITE);
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        btn.setPadding(0, 0, 0, 0);
        btn.setBackgroundColor(Color.argb(24, 255, 255, 255));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(34), dp(34));
        lp.setMargins(dp(3), 0, dp(3), 0);
        btn.setLayoutParams(lp);
        btn.setOnClickListener(listener);
        return btn;
    }

    private void emitNativeBridgeMessage(final String payloadJson, final String expectedSourceOrigin) {
        if (payloadJson == null || dappWebView == null) return;
        final String topUrl = dappWebView.getUrl();
        if (!isAllowedDAppUrl(topUrl)) return;
        final String nativeOrigin = originString(topUrl);
        if (nativeOrigin == null) return;
        if (expectedSourceOrigin != null && !nativeOrigin.equalsIgnoreCase(expectedSourceOrigin)) return;
        JSObject data = new JSObject();
        data.put("payload", payloadJson);
        data.put("nativeOrigin", nativeOrigin);
        data.put("nativeUrl", topUrl);
        notifyListeners("bridgeMessage", data);
    }

    private class BridgeJsInterface {
        @JavascriptInterface
        public void postMessage(final String payloadJson) {
            // Unauthenticated 1-arg bridge calls are blocked to prevent subframe spoofing.
        }

        @JavascriptInterface
        public void postMessageSecure(final String payloadJson, final String token) {
            if (payloadJson == null || token == null || bridgeSessionToken == null || bridgeSessionToken.isEmpty()) return;
            if (!MessageDigest.isEqual(
                    bridgeSessionToken.getBytes(StandardCharsets.UTF_8),
                    token.getBytes(StandardCharsets.UTF_8))) {
                return;
            }
            mainHandler.post(() -> emitNativeBridgeMessage(payloadJson, null));
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @PluginMethod
    public void openUrl(final PluginCall call) {
        final String targetUrl = call.getString("url", "");
        if (!isAllowedDAppUrl(targetUrl)) {
            call.reject("Invalid or disallowed DApp URL");
            return;
        }
        final String script = call.getString("injectedScript", "");
        this.injectedScriptSource = script != null ? script : "";

        mainHandler.post(() -> {
            Activity act = getActivity();
            if (act == null || act.isFinishing()) {
                call.reject("Activity unavailable");
                return;
            }
            teardownOverlayOnly();
            this.bridgeSessionToken = generateBridgeToken();
            this.guardedInjectedScript = buildMainFrameGuardedScript(this.injectedScriptSource, this.bridgeSessionToken);

            ViewGroup rootContent = act.findViewById(android.R.id.content);
            if (rootContent == null) {
                call.reject("Root view unavailable");
                return;
            }

            LinearLayout container = new LinearLayout(act);
            container.setOrientation(LinearLayout.VERTICAL);
            container.setBackgroundColor(Color.parseColor("#06080f"));
            container.setLayoutParams(new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT));

            LinearLayout topBar = new LinearLayout(act);
            topBar.setOrientation(LinearLayout.HORIZONTAL);
            topBar.setGravity(Gravity.CENTER_VERTICAL);
            topBar.setBackgroundColor(Color.parseColor("#0b1120"));
            topBar.setPadding(dp(8), getStatusBarTopInset(act) + dp(4), dp(8), dp(6));

            Button backBtn = makeToolbarButton(act, "<", v -> {
                if (dappWebView != null && dappWebView.canGoBack()) dappWebView.goBack();
            });
            Button fwdBtn = makeToolbarButton(act, ">", v -> {
                if (dappWebView != null && dappWebView.canGoForward()) dappWebView.goForward();
            });
            TextView titleTxt = new TextView(act);
            titleTxt.setTextColor(Color.WHITE);
            titleTxt.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
            titleTxt.setSingleLine(true);
            titleTxt.setEllipsize(TextUtils.TruncateAt.MIDDLE);
            titleTxt.setGravity(Gravity.CENTER);
            try {
                Uri parsed = Uri.parse(targetUrl);
                titleTxt.setText(parsed.getHost() != null ? parsed.getHost() : targetUrl);
            } catch (Exception e) {
                titleTxt.setText(targetUrl);
            }
            LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            titleLp.setMargins(dp(6), 0, dp(6), 0);
            titleTxt.setLayoutParams(titleLp);

            Button reloadBtn = makeToolbarButton(act, "↻", v -> {
                if (dappWebView != null) dappWebView.reload();
            });
            Button closeBtn = makeToolbarButton(act, "✕", v -> {
                teardownOverlayOnly();
                notifyListeners("browserClosed", new JSObject());
            });

            topBar.addView(backBtn);
            topBar.addView(fwdBtn);
            topBar.addView(titleTxt);
            topBar.addView(reloadBtn);
            topBar.addView(closeBtn);

            WebView wv = new WebView(act);
            WebSettings settings = wv.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setSupportMultipleWindows(false);
            wv.addJavascriptInterface(new BridgeJsInterface(), "NexusAndroidBridge");
            wv.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onProgressChanged(WebView view, int newProgress) {
                    super.onProgressChanged(view, newProgress);
                    if (newProgress >= 5 && view != null) {
                        injectProviderIfAllowed(view, view.getUrl());
                    }
                }
            });
            wv.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    String nextUrl = request != null && request.getUrl() != null ? request.getUrl().toString() : "";
                    return !isAllowedDAppUrl(nextUrl);
                }

                @Override
                public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                    super.onPageStarted(view, url, favicon);
                    injectProviderIfAllowed(view, url);
                    syncChrome(view);
                }

                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    super.onPageCommitVisible(view, url);
                    injectProviderIfAllowed(view, url);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    injectProviderIfAllowed(view, url);
                    syncChrome(view);
                }
            });

            LinearLayout.LayoutParams wvLp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
            wv.setLayoutParams(wvLp);

            container.addView(topBar);
            container.addView(wv);
            rootContent.addView(container);

            overlayRoot = container;
            dappWebView = wv;
            urlView = titleTxt;
            backButton = backBtn;
            forwardButton = fwdBtn;

            webMessageListenerRegistered = tryRegisterWebMessageListener(wv);
            documentStartRegistered = tryRegisterDocumentStartScript(wv, this.guardedInjectedScript);
            wv.loadUrl(targetUrl);
            JSObject out = new JSObject();
            out.put("opened", true);
            call.resolve(out);
        });
    }

    private boolean tryRegisterWebMessageListener(WebView view) {
        if (view == null) return false;
        try {
            Class<?> featureCls = Class.forName("androidx.webkit.WebViewFeature");
            String featureName = "WEB_MESSAGE_LISTENER";
            try {
                Object fieldVal = featureCls.getField("WEB_MESSAGE_LISTENER").get(null);
                if (fieldVal instanceof String) featureName = (String) fieldVal;
            } catch (Exception ignored) {
            }
            Method isSupported = featureCls.getMethod("isFeatureSupported", String.class);
            Object supported = isSupported.invoke(null, featureName);
            if (!Boolean.TRUE.equals(supported)) return false;

            Class<?> compatCls = Class.forName("androidx.webkit.WebViewCompat");
            Class<?> listenerCls = Class.forName("androidx.webkit.WebViewCompat$WebMessageListener");
            Object proxy = Proxy.newProxyInstance(
                    listenerCls.getClassLoader(),
                    new Class<?>[]{ listenerCls },
                    (p, method, args) -> {
                        if (method != null && "onPostMessage".equals(method.getName()) && args != null && args.length >= 4) {
                            Object msgObj = args[1];
                            Uri sourceUri = args[2] instanceof Uri ? (Uri) args[2] : null;
                            boolean isMainFrame = Boolean.TRUE.equals(args[3]);
                            if (!isMainFrame || msgObj == null || sourceUri == null) return null;
                            String srcOrigin = originString(sourceUri.toString());
                            if (srcOrigin == null) return null;
                            Object rawData = msgObj.getClass().getMethod("getData").invoke(msgObj);
                            if (!(rawData instanceof String)) return null;
                            final String payloadJson = (String) rawData;
                            mainHandler.post(() -> emitNativeBridgeMessage(payloadJson, srcOrigin));
                        }
                        return null;
                    }
            );
            Method addListener = compatCls.getMethod(
                    "addWebMessageListener",
                    WebView.class,
                    String.class,
                    Set.class,
                    listenerCls
            );
            addListener.invoke(null, view, WEB_MESSAGE_BRIDGE_NAME, Collections.singleton("*"), proxy);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean tryRegisterDocumentStartScript(WebView view, String script) {
        if (view == null || script == null || script.isEmpty()) return false;
        try {
            Class<?> featureCls = Class.forName("androidx.webkit.WebViewFeature");
            String featureName = "DOCUMENT_START_SCRIPT";
            try {
                Object fieldVal = featureCls.getField("DOCUMENT_START_SCRIPT").get(null);
                if (fieldVal instanceof String) featureName = (String) fieldVal;
            } catch (Exception ignored) {
            }
            Method isSupported = featureCls.getMethod("isFeatureSupported", String.class);
            Object supported = isSupported.invoke(null, featureName);
            if (!Boolean.TRUE.equals(supported)) return false;

            Class<?> compatCls = Class.forName("androidx.webkit.WebViewCompat");
            Method addDocStart = compatCls.getMethod("addDocumentStartJavaScript", WebView.class, String.class, Set.class);
            addDocStart.invoke(null, view, script, Collections.singleton("*"));
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private void injectProviderIfAllowed(WebView view, String url) {
        if (documentStartRegistered) return;
        if (view == null || guardedInjectedScript == null || guardedInjectedScript.isEmpty()) return;
        if (!isAllowedDAppUrl(url)) return;
        view.evaluateJavascript(guardedInjectedScript, null);
    }

    private void syncChrome(WebView view) {
        if (view == null) return;
        String currentUrl = view.getUrl() != null ? view.getUrl() : "";
        if (urlView != null) {
            try {
                Uri parsed = Uri.parse(currentUrl);
                urlView.setText(parsed.getHost() != null ? parsed.getHost() : currentUrl);
            } catch (Exception e) {
                urlView.setText(currentUrl);
            }
        }
        if (backButton != null) backButton.setAlpha(view.canGoBack() ? 1.0f : 0.4f);
        if (forwardButton != null) forwardButton.setAlpha(view.canGoForward() ? 1.0f : 0.4f);
        JSObject ev = new JSObject();
        ev.put("url", currentUrl);
        ev.put("title", view.getTitle() != null ? view.getTitle() : "");
        notifyListeners("pageChanged", ev);
    }

    private void teardownOverlayOnly() {
        if (dappWebView != null) {
            if (webMessageListenerRegistered) {
                try {
                    Class<?> compatCls = Class.forName("androidx.webkit.WebViewCompat");
                    Method removeListener = compatCls.getMethod("removeWebMessageListener", WebView.class, String.class);
                    removeListener.invoke(null, dappWebView, WEB_MESSAGE_BRIDGE_NAME);
                } catch (Exception ignored) {}
            }
            try { dappWebView.removeJavascriptInterface("NexusAndroidBridge"); } catch (Exception ignored) {}
            try { dappWebView.stopLoading(); } catch (Exception ignored) {}
            try { dappWebView.destroy(); } catch (Exception ignored) {}
        }
        if (overlayRoot != null && overlayRoot.getParent() instanceof ViewGroup) {
            ((ViewGroup) overlayRoot.getParent()).removeView(overlayRoot);
        }
        dappWebView = null;
        overlayRoot = null;
        urlView = null;
        backButton = null;
        forwardButton = null;
        bridgeSessionToken = "";
        guardedInjectedScript = "";
        documentStartRegistered = false;
        webMessageListenerRegistered = false;
    }

    @PluginMethod
    public void sendResponse(final PluginCall call) {
        final String reqId = call.getString("id", "");
        final String resJson = call.getString("resultJson");
        final String errJson = call.getString("errorJson");
        final String js = "window.__nexusOnBridgeResponse && window.__nexusOnBridgeResponse("
                + JSONObject.quote(reqId) + ", "
                + (resJson != null ? JSONObject.quote(resJson) : "null") + ", "
                + (errJson != null ? JSONObject.quote(errJson) : "null") + ");";
        mainHandler.post(() -> {
            if (dappWebView != null) {
                dappWebView.evaluateJavascript(js, null);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void emitProviderEvent(final PluginCall call) {
        final String ns = call.getString("namespace", "evm");
        final String ev = call.getString("eventName", "");
        final String payload = call.getString("payload");
        final String js = "window.__nexusOnProviderEvent && window.__nexusOnProviderEvent("
                + JSONObject.quote(ns) + ", "
                + JSONObject.quote(ev) + ", "
                + (payload != null ? JSONObject.quote(payload) : "null") + ");";
        mainHandler.post(() -> {
            if (dappWebView != null) {
                dappWebView.evaluateJavascript(js, null);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void setOverlayVisible(final PluginCall call) {
        final boolean visible = Boolean.TRUE.equals(call.getBoolean("visible", true));
        mainHandler.post(() -> {
            if (overlayRoot != null) {
                overlayRoot.setVisibility(visible ? View.VISIBLE : View.GONE);
            }
            JSObject res = new JSObject();
            res.put("visible", visible);
            call.resolve(res);
        });
    }

    @PluginMethod
    public void close(final PluginCall call) {
        mainHandler.post(() -> {
            teardownOverlayOnly();
            notifyListeners("browserClosed", new JSObject());
            call.resolve();
        });
    }
}
