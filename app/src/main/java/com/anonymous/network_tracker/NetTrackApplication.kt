package com.anonymous.network_tracker

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import com.anonymous.network_tracker.data.db.UsageDatabase
import com.anonymous.network_tracker.service.WifiWatchService

class NetTrackApplication : Application() {

    val database: UsageDatabase by lazy { UsageDatabase.getInstance(this) }

    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannels()
        WifiWatchService.sync(this)
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            val alertChannel = NotificationChannel(
                CHANNEL_ALERTS,
                "Data Usage Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications for data quota warnings and limits"
                enableVibration(true)
            }
            nm.createNotificationChannel(alertChannel)
        }
    }

    companion object {
        const val CHANNEL_ALERTS = "usage-alerts"
        lateinit var instance: NetTrackApplication
            private set
    }
}

