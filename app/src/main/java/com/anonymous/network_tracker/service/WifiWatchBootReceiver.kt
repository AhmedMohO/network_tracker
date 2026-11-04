package com.anonymous.network_tracker.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class WifiWatchBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != Intent.ACTION_MY_PACKAGE_REPLACED
        ) return
        WifiWatchService.sync(context)
        if (SyncKeepAlive.isEnabled(context)) {
            SyncKeepAlive.arm(context)
        }
    }
}

