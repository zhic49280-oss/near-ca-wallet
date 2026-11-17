package io.pearl.wallet;

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
        res.put("supportsBiometrics", hasFingerprint || hasFace || hasIris);
        res.put("supportsPasscode", hasDeviceCredential);
        call.resolve(res);
    }

    @PluginMethod
    public void authenticateWithBiometrics(PluginCall call) {
        String reason = call.getString("reason", "验证身份以授权交易或查看密钥 / Verify identity");
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity unavailable", "AUTH_UNAVAILABLE");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            activity.runOnUiThread(() -> {
                try {
                    BiometricPrompt.Builder builder = new BiometricPrompt.Builder(ctxOrActivity(activity))
                            .setTitle("安全验证 / Security Verification")
                            .setSubtitle(reason);

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        builder.setAllowedAuthenticators(
                                BiometricManager.Authenticators.BIOMETRIC_STRONG
                                        | BiometricManager.Authenticators.BIOMETRIC_WEAK
                                        | BiometricManager.Authenticators.DEVICE_CREDENTIAL
                        );
                    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        builder.setDeviceCredentialAllowed(true);
                    } else {
                        builder.setNegativeButton("使用锁屏密码 / Passcode", activity.getMainExecutor(), (dialog, which) ->
                                launchKeyguardFallback(activity, reason, call));
                    }

                    BiometricPrompt prompt = builder.build();
                    CancellationSignal signal = new CancellationSignal();
                    prompt.authenticate(signal, activity.getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                            JSObject out = new JSObject();
                            out.put("authenticated", true);
                            out.put("type", "biometric");
                            call.resolve(out);
                        }

                        @Override
                        public void onAuthenticationError(int errorCode, CharSequence errString) {
                            call.reject(errString != null ? errString.toString() : "Biometric error", "AUTH_FAILED");
                        }

                        @Override
                        public void onAuthenticationFailed() {
                            // Keep prompt open for retry until user cancels or succeeds
                        }
                    });
                } catch (Exception ex) {
                    launchKeyguardFallback(activity, reason, call);
                }
            });
            return;
        }

        launchKeyguardFallback(activity, reason, call);
    }

    private Context ctxOrActivity(Activity activity) {
        return activity != null ? activity : getContext();
    }

    @SuppressWarnings("deprecation")
    private void launchKeyguardFallback(Activity activity, String reason, PluginCall call) {
        KeyguardManager km = (KeyguardManager) activity.getSystemService(Context.KEYGUARD_SERVICE);
        if (km == null || !km.isDeviceSecure()) {
            call.reject("Device credential lockscreen not configured", "AUTH_UNAVAILABLE");
            return;
        }
        Intent intent = km.createConfirmDeviceCredentialIntent("安全验证 / Security Verification", reason);
        if (intent == null) {
            call.reject("Device credential intent unavailable", "AUTH_UNAVAILABLE");
            return;
        }
        startActivityForResult(call, intent, "onDeviceCredentialResult");
    }

    @ActivityCallback
    private void onDeviceCredentialResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() == Activity.RESULT_OK) {
            JSObject out = new JSObject();
            out.put("authenticated", true);
            out.put("type", "passcode");
            call.resolve(out);
        } else {
            call.reject("Device credential authentication cancelled", "AUTH_CANCELLED");
        }
    }
}
