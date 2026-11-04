package com.anonymous.network_tracker.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class SyncTickReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != SyncKeepAlive.ACTION_TICK) return
        SyncKeepAlive.onTick(context)
    }
}
