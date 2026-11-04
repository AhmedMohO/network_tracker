package com.anonymous.network_tracker.data.repository

import android.content.Context
import android.content.SharedPreferences

data class AppSettings(
    val cycleStartDay: Int = 1,
    val mobileLimitBytes: Long? = null,
    val mobileWarnAtPercent: Int = 80,
    val wifiLimitBytes: Long? = null,
    val wifiWarnAtPercent: Int = 80,
    val showSystemApps: Boolean = false,
    val alertedKeys: Set<String> = emptySet(),
    val language: String = "en", // "en" | "ar"
    val themeMode: String = "system" // "system" | "dark" | "light"
)

class SettingsRepository(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun loadSettings(): AppSettings {
        val mobileLimit = if (prefs.contains(KEY_MOBILE_LIMIT)) prefs.getLong(KEY_MOBILE_LIMIT, 0L) else null
        val wifiLimit = if (prefs.contains(KEY_WIFI_LIMIT)) prefs.getLong(KEY_WIFI_LIMIT, 0L) else null

        return AppSettings(
            cycleStartDay = prefs.getInt(KEY_CYCLE_START_DAY, 1),
            mobileLimitBytes = mobileLimit,
            mobileWarnAtPercent = prefs.getInt(KEY_MOBILE_WARN_PCT, 80),
            wifiLimitBytes = wifiLimit,
            wifiWarnAtPercent = prefs.getInt(KEY_WIFI_WARN_PCT, 80),
            showSystemApps = prefs.getBoolean(KEY_SHOW_SYSTEM_APPS, false),
            alertedKeys = prefs.getStringSet(KEY_ALERTED_KEYS, emptySet()) ?: emptySet(),
            language = prefs.getString(KEY_LANGUAGE, "en") ?: "en",
            themeMode = prefs.getString(KEY_THEME_MODE, "system") ?: "system"
        )
    }

    fun updateSettings(settings: AppSettings) {
        val editor = prefs.edit()
            .putInt(KEY_CYCLE_START_DAY, settings.cycleStartDay)
            .putInt(KEY_MOBILE_WARN_PCT, settings.mobileWarnAtPercent)
            .putInt(KEY_WIFI_WARN_PCT, settings.wifiWarnAtPercent)
            .putBoolean(KEY_SHOW_SYSTEM_APPS, settings.showSystemApps)
            .putStringSet(KEY_ALERTED_KEYS, settings.alertedKeys)
            .putString(KEY_LANGUAGE, settings.language)
            .putString(KEY_THEME_MODE, settings.themeMode)

        if (settings.mobileLimitBytes != null) {
            editor.putLong(KEY_MOBILE_LIMIT, settings.mobileLimitBytes)
        } else {
            editor.remove(KEY_MOBILE_LIMIT)
        }

        if (settings.wifiLimitBytes != null) {
            editor.putLong(KEY_WIFI_LIMIT, settings.wifiLimitBytes)
        } else {
            editor.remove(KEY_WIFI_LIMIT)
        }

        editor.apply()
    }

    fun markAlertKey(key: String) {
        val current = prefs.getStringSet(KEY_ALERTED_KEYS, emptySet())?.toMutableSet() ?: mutableSetOf()
        current.add(key)
        prefs.edit().putStringSet(KEY_ALERTED_KEYS, current).apply()
    }

    fun resetAlertKeys(keysToKeep: Set<String> = emptySet()) {
        prefs.edit().putStringSet(KEY_ALERTED_KEYS, keysToKeep).apply()
    }

    companion object {
        private const val PREFS_NAME = "nettrack_settings"
        private const val KEY_CYCLE_START_DAY = "cycleStartDay"
        private const val KEY_MOBILE_LIMIT = "mobileLimitBytes"
        private const val KEY_MOBILE_WARN_PCT = "mobileWarnAtPercent"
        private const val KEY_WIFI_LIMIT = "wifiLimitBytes"
        private const val KEY_WIFI_WARN_PCT = "wifiWarnAtPercent"
        private const val KEY_SHOW_SYSTEM_APPS = "showSystemApps"
        private const val KEY_ALERTED_KEYS = "alertedKeys"
        private const val KEY_LANGUAGE = "language"
        private const val KEY_THEME_MODE = "themeMode"

        @Volatile
        private var INSTANCE: SettingsRepository? = null

        fun getInstance(context: Context): SettingsRepository {
            return INSTANCE ?: synchronized(this) {
                val instance = SettingsRepository(context.applicationContext)
                INSTANCE = instance
                instance
            }
        }
    }
}
