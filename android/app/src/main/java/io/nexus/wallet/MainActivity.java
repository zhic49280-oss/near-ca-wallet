package io.nexus.wallet;

import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private FrameLayout privacyCurtain = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeSecurityPlugin.class);
        super.onCreate(savedInstanceState);
        if (getWindow() != null) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        if (!NativeSecurityPlugin.isAuthenticating) {
            showPrivacyCurtain();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        hidePrivacyCurtain();
    }

    private void showPrivacyCurtain() {
        runOnUiThread(() -> {
            if (privacyCurtain != null) return;
            ViewGroup decor = getWindow() != null ? (ViewGroup) getWindow().getDecorView() : null;
            if (decor == null) return;

            FrameLayout overlay = new FrameLayout(this);
            overlay.setBackgroundColor(Color.parseColor("#EE06080F"));
            overlay.setClickable(true);
            overlay.setFocusable(true);

            TextView label = new TextView(this);
            label.setText("NEXUS WALLET");
            label.setTextColor(Color.parseColor("#00EC97"));
            label.setTextSize(14f);
            label.setGravity(Gravity.CENTER);

            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    Gravity.CENTER
            );
            overlay.addView(label, lp);
            decor.addView(overlay, new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
            ));
            privacyCurtain = overlay;
        });
    }

    private void hidePrivacyCurtain() {
        runOnUiThread(() -> {
            if (privacyCurtain == null) return;
            ViewGroup parent = (ViewGroup) privacyCurtain.getParent();
            if (parent != null) {
                parent.removeView(privacyCurtain);
            }
            privacyCurtain = null;
        });
    }
}
