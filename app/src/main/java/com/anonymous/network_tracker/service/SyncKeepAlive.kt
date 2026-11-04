package com.anonymous.network_tracker.service

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

object SyncKeepAlive {

    private const val PREFS = "network-usage-keep-alive"
    private const val KEY_ENABLED = "enabled"
    private const val TAG = "SyncKeepAlive"

    const val ACTION_TICK = "com.anonymous.network_tracker.SYNC_TICK"
    private const val REQUEST_CODE = 4712
    const val INTERVAL_MS = 15 * 60_000L

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isEnabled(context: Context): Boolean =
        prefs(context).getBoolean(KEY_ENABLED, true)

    fun setEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
        if (enabled) arm(context) else cancel(context)
    }

    fun onTick(context: Context) {
        WifiSessions.markSeen(context)
        if (isEnabled(context)) {
            arm(context)
        }
        runBackgroundTasks(context)
    }

    fun arm(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val pi = pendingIntent(context) ?: return
        val triggerAt = System.currentTimeMillis() + INTERVAL_MS

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            } else {
                am.set(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to arm keep-alive alarm: ${e.message}")
        }
    }

    fun cancel(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val pi = pendingIntent(context) ?: return
        am.cancel(pi)
    }

    private fun pendingIntent(context: Context): PendingIntent? {
        val intent = Intent(context, SyncTickReceiver::class.java).apply {
            action = ACTION_TICK
        }
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, flags)
    }

    fun runBackgroundTasks(context: Context) {
        // Run background work asynchronously
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // Check quotas and daily snapshots
                val repo = com.anonymous.network_tracker.data.repository.UsageRepository.getInstance(context)
                repo.performBackgroundCheck()
            } catch (e: Exception) {
                Log.w(TAG, "Background check error: ${e.message}")
            }
        }
    }

    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return true
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    fun requestIgnoreBatteryOptimizations(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        val direct = Intent(
            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            Uri.parse("package:${context.packageName}")
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(direct) }
            .recoverCatching { context.startActivity(fallback) }
            .onFailure { Log.w(TAG, "No battery-optimisation screen: ${it.message}") }
    }
}

