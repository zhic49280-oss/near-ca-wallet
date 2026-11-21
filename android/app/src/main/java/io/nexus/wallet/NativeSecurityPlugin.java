package io.nexus.wallet;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.CancellationSignal;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Model-aware Android hardware BiometricPrompt + Keyguard device credential plugin.
 * Supports Fingerprint, Face Unlock, Iris, and System Lockscreen PIN/Pattern/Password
 * across Xiaomi/Redmi, Huawei/Honor, OPPO/OnePlus, vivo/iQOO, Samsung, and Google Pixel.
 */
@CapacitorPlugin(name = "NativeSecurity")
public class NativeSecurityPlugin extends Plugin {

    public static volatile boolean isAuthenticating = false;
    private CancellationSignal activeSignal = null;

    @Override
    protected void handleOnDestroy() {
        isAuthenticating = false;
        if (activeSignal != null) {
            try {
                activeSignal.cancel();
            } catch (Exception ignored) {
            }
            activeSignal = null;
        }
        super.handleOnDestroy();
    }

    private String resolveBrandFamily(String manufacturer, String brand) {
        String combined = (manufacturer + " " + brand).toLowerCase();
        if (combined.contains("xiaomi") || combined.contains("redmi") || combined.contains("poco")) {
            return "Xiaomi/Redmi";
        }
        if (combined.contains("huawei") || combined.contains("honor")) {
            return "Huawei/Honor";
        }
        if (combined.contains("oppo") || combined.contains("oneplus") || combined.contains("realme")) {
            return "OPPO/OnePlus";
        }
        if (combined.contains("vivo") || combined.contains("iqoo")) {
            return "vivo/iQOO";
        }
        if (combined.contains("samsung")) {
            return "Samsung";
        }
        if (combined.contains("google")) {
            return "Google Pixel";
        }
        return manufacturer != null && !manufacturer.isEmpty() ? manufacturer : "Android";
    }

    @PluginMethod
    public void getSecurityCapabilities(PluginCall call) {
        Context ctx = getContext();
        PackageManager pm = ctx.getPackageManager();
        KeyguardManager km = (KeyguardManager) ctx.getSystemService(Context.KEYGUARD_SERVICE);

        String manufacturer = Build.MANUFACTURER != null ? Build.MANUFACTURER : "";
        String brand = Build.BRAND != null ? Build.BRAND : "";
        String model = Build.MODEL != null ? Build.MODEL : "";

        boolean hasFingerprint = pm.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT);
        boolean hasFace = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                && pm.hasSystemFeature(PackageManager.FEATURE_FACE);
        boolean hasIris = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                && pm.hasSystemFeature(PackageManager.FEATURE_IRIS);
        boolean hasDeviceCredential = km != null && km.isDeviceSecure();

        boolean supportsStrongBio = hasFingerprint || hasFace || hasIris;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            BiometricManager bm = (BiometricManager) ctx.getSystemService(Context.BIOMETRIC_SERVICE);
            if (bm != null) {
                supportsStrongBio = bm.canAuthenticate(
                        BiometricManager.Authenticators.BIOMETRIC_STRONG
                                | BiometricManager.Authenticators.BIOMETRIC_WEAK
                ) == BiometricManager.BIOMETRIC_SUCCESS;
            }
        }

        String biometryType = "none";
        if (hasFingerprint && hasFace) {
            biometryType = "fingerprint_and_face";
        } else if (hasFace) {
            biometryType = "face";
        } else if (hasFingerprint) {
            biometryType = "fingerprint";
        } else if (hasIris) {
            biometryType = "iris";
        } else if (hasDeviceCredential) {
            biometryType = "passcode";
        }

        JSObject res = new JSObject();
        res.put("platform", "android");
        res.put("manufacturer", manufacturer);
        res.put("brand", brand);
        res.put("brandFamily", resolveBrandFamily(manufacturer, brand));
        res.put("model", model);
        res.put("sdkInt", Build.VERSION.SDK_INT);
        res.put("hasFingerprint", hasFingerprint);
        res.put("hasFace", hasFace);
        res.put("hasIris", hasIris);
        res.put("hasDeviceCredential", hasDeviceCredential);
        res.put("biometryType", biometryType);
        res.put("supportsBiometrics", supportsStrongBio);
        res.put("supportsPasscode", hasDeviceCredential);
        call.resolve(res);
    }

    @PluginMethod
    public void authenticateWithBiometrics(PluginCall call) {
        String title = call.getString("title", "安全验证 / Security Verification");
        String subtitle = call.getString("subtitle", "");
        String reason = call.getString("reason", "验证身份以授权交易或查看密钥 / Verify identity");
        String effectiveSubtitle = (subtitle != null && !subtitle.isEmpty()) ? subtitle : reason;

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Activity unavailable", "AUTH_UNAVAILABLE");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            BiometricManager bm = (BiometricManager) activity.getSystemService(Context.BIOMETRIC_SERVICE);
            int allowed = BiometricManager.Authenticators.BIOMETRIC_STRONG
                    | BiometricManager.Authenticators.BIOMETRIC_WEAK
                    | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
            if (bm != null && bm.canAuthenticate(allowed) != BiometricManager.BIOMETRIC_SUCCESS) {
                call.reject("Biometric or device credential authentication unavailable", "AUTH_UNAVAILABLE");
                return;
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            activity.runOnUiThread(() -> {
                if (activity.isFinishing() || activity.isDestroyed()) {
                    call.reject("Activity destroyed", "AUTH_UNAVAILABLE");
                    return;
                }
                final CancellationSignal mySignal = new CancellationSignal();
                try {
                    BiometricPrompt.Builder builder = new BiometricPrompt.Builder(ctxOrActivity(activity))
                            .setTitle(title)
                            .setSubtitle(effectiveSubtitle);

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        builder.setAllowedAuthenticators(
                                BiometricManager.Authenticators.BIOMETRIC_STRONG
                                        | BiometricManager.Authenticators.BIOMETRIC_WEAK
                                        | BiometricManager.Authenticators.DEVICE_CREDENTIAL
                        );
                    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        builder.setDeviceCredentialAllowed(true);
                    } else {
                        String fallbackBtn = call.getString("fallbackTitle", "使用锁屏密码 / Passcode");
                        builder.setNegativeButton(fallbackBtn, activity.getMainExecutor(), (dialog, which) ->
                                launchKeyguardFallback(activity, title, effectiveSubtitle, call));
                    }

                    BiometricPrompt prompt = builder.build();
                    if (activeSignal != null) {
                        try {
                            activeSignal.cancel();
                        } catch (Exception ignored) {
                        }
                    }
                    activeSignal = mySignal;
                    isAuthenticating = true;
                    prompt.authenticate(mySignal, activity.getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                            isAuthenticating = false;
                            if (activeSignal == mySignal) activeSignal = null;
                            String authType = "biometric";
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && result != null
                                    && result.getAuthenticationType() == BiometricPrompt.AUTHENTICATION_RESULT_TYPE_DEVICE_CREDENTIAL) {
                                authType = "passcode";
                            }
                            JSObject out = new JSObject();
                            out.put("authenticated", true);
                            out.put("type", authType);
                            call.resolve(out);
                        }

                        @Override
                        public void onAuthenticationError(int errorCode, CharSequence errString) {
                            isAuthenticating = false;
                            if (activeSignal == mySignal) activeSignal = null;
                            boolean isCancel = errorCode == BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED
                                    || errorCode == BiometricPrompt.BIOMETRIC_ERROR_CANCELED
                                    || errorCode == 13; // ERROR_NEGATIVE_BUTTON
                            call.reject(
                                    errString != null ? errString.toString() : "Biometric error",
                                    isCancel ? "AUTH_CANCELLED" : "AUTH_FAILED"
                            );
                        }

                        @Override
                        public void onAuthenticationFailed() {
                            // Keep prompt open for retry until user cancels or succeeds
                        }
                    });
                } catch (Exception ex) {
                    isAuthenticating = false;
                    if (activeSignal == mySignal) activeSignal = null;
                    launchKeyguardFallback(activity, title, effectiveSubtitle, call);
                }
            });
            return;
        }

        launchKeyguardFallback(activity, title, effectiveSubtitle, call);
    }

    private Context ctxOrActivity(Activity activity) {
        return activity != null ? activity : getContext();
    }

    @SuppressWarnings("deprecation")
    private void launchKeyguardFallback(Activity activity, String title, String reason, PluginCall call) {
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Activity unavailable", "AUTH_UNAVAILABLE");
            return;
        }
        KeyguardManager km = (KeyguardManager) activity.getSystemService(Context.KEYGUARD_SERVICE);
        if (km == null || !km.isDeviceSecure()) {
            call.reject("Device credential lockscreen not configured", "AUTH_UNAVAILABLE");
            return;
        }
        Intent intent = km.createConfirmDeviceCredentialIntent(title, reason);
        if (intent == null) {
            isAuthenticating = false;
            call.reject("Device credential intent unavailable", "AUTH_UNAVAILABLE");
            return;
        }
        isAuthenticating = true;
        startActivityForResult(call, intent, "onDeviceCredentialResult");
    }

    @ActivityCallback
    private void onDeviceCredentialResult(PluginCall call, ActivityResult result) {
        isAuthenticating = false;
        if (call == null) return;
        if (result != null && result.getResultCode() == Activity.RESULT_OK) {
            JSObject out = new JSObject();
            out.put("authenticated", true);
            out.put("type", "passcode");
            call.resolve(out);
        } else {
            call.reject("Device credential authentication cancelled", "AUTH_CANCELLED");
        }
    }
}
