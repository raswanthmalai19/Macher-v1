package com.macher.android.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager

/**
 * Manifest-declared receiver for ACTION_PHONE_STATE_CHANGED.
 *
 * On MIUI/Xiaomi devices, dynamically-registered receivers (those created at runtime)
 * can be silenced by MIUI's background-start restrictions. A manifest-declared receiver
 * is started directly by the Android system and is not subject to the same restrictions.
 *
 * This receiver forwards the phone state to MainActivity via an internal broadcast.
 * ACTION_PHONE_STATE_CHANGED is on the Android implicit-broadcast exemption list so
 * manifest declaration still works on Android 8+ (see broadcast-exceptions docs).
 */
class PhoneStateManifestReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context?, intent: Intent?) {
        context ?: return
        val stateStr = intent?.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return

        com.macher.android.util.Logger.info(
            "PhoneStateManifestReceiver",
            "[ManifestReceiver] PHONE_STATE = $stateStr"
        )

        // Forward to MainActivity (if alive) via internal broadcast
        val forward = Intent(ACTION_INTERNAL_PHONE_STATE)
        forward.putExtra(TelephonyManager.EXTRA_STATE, stateStr)
        forward.setPackage(context.packageName)
        context.sendBroadcast(forward)
    }

    companion object {
        const val ACTION_INTERNAL_PHONE_STATE = "com.macher.android.ACTION_INTERNAL_PHONE_STATE"
    }
}
