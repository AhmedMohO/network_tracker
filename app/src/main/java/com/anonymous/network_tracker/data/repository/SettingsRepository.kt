package com.anonymous.network_tracker.data.repository

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

data class AppSettings(
    val cycleStartDay: Int = 1,
    val mobileLimitBytes: Long? = null,
    val mobileWarnAtPercent: Int = 80,
    val wifiLimitBytes: Long? = null,
    val wifiWarnAtPercent: Int = 80,
    val showSystemApps: Boolean = false,
    val alertedKeys: Set<String> = emptySet(),
    val language: String = "en", // "en" | "ar"
    val themeMode: String = "system", // "system" | "dark" | "light"
    val familyRole: String? = null, // "parent" | "child" | null
    val pairToken: String? = null,
    val deviceId: String? = null,
    val deviceLabel: String? = null,
    val pairedLabel: String? = null,
    val lastSyncOkAt: Long? = null,
    val lastSyncErrorAt: Long? = null
)

class SettingsRepository(private val context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun loadSettings(): AppSettings {
        // 1. Try reading directly from React Native's ExpoSQLiteStorage (settings.v1)
        val rawExpoJson = ExpoStorageBridge.getItem(context, KEY_EXPO_SETTINGS)
        val savedLang = ExpoStorageBridge.getItem(context, KEY_EXPO_LANG)

        if (rawExpoJson != null) {
            try {
                val json = JSONObject(rawExpoJson)
                val cycleDay = json.optInt("cycleStartDay", 1).coerceIn(1, 31)
                val mobileLimit = if (json.has("mobileLimitBytes") && !json.isNull("mobileLimitBytes")) json.optLong("mobileLimitBytes") else null
                val mobileWarn = json.optInt("mobileWarnAtPercent", 80).coerceIn(1, 100)
                val wifiLimit = if (json.has("wifiLimitBytes") && !json.isNull("wifiLimitBytes")) json.optLong("wifiLimitBytes") else null
                val wifiWarn = json.optInt("wifiWarnAtPercent", 80).coerceIn(1, 100)
                val showSystem = json.optBoolean("showSystemApps", false)

                val alerted = mutableSetOf<String>()
                val alertedArr = json.optJSONArray("alertedKeys")
                if (alertedArr != null) {
                    for (i in 0 until alertedArr.length()) {
                        alerted.add(alertedArr.getString(i))
                    }
                }

                val role = if (json.has("familyRole") && !json.isNull("familyRole")) json.getString("familyRole") else null
                val token = if (json.has("pairToken") && !json.isNull("pairToken")) json.getString("pairToken") else null
                val devId = if (json.has("deviceId") && !json.isNull("deviceId")) json.getString("deviceId") else null
                val devLabel = if (json.has("deviceLabel") && !json.isNull("deviceLabel")) json.getString("deviceLabel") else null
                val pLabel = if (json.has("pairedLabel") && !json.isNull("pairedLabel")) json.getString("pairedLabel") else null
                val syncOk = if (json.has("lastSyncOkAt") && !json.isNull("lastSyncOkAt")) json.getLong("lastSyncOkAt") else null
                val syncErr = if (json.has("lastSyncErrorAt") && !json.isNull("lastSyncErrorAt")) json.getLong("lastSyncErrorAt") else null

                val language = savedLang ?: prefs.getString(KEY_LANGUAGE, "en") ?: "en"

                val settings = AppSettings(
                    cycleStartDay = cycleDay,
                    mobileLimitBytes = mobileLimit,
                    mobileWarnAtPercent = mobileWarn,
                    wifiLimitBytes = wifiLimit,
                    wifiWarnAtPercent = wifiWarn,
                    showSystemApps = showSystem,
                    alertedKeys = alerted,
                    language = language,
                    themeMode = prefs.getString(KEY_THEME_MODE, "system") ?: "system",
                    familyRole = role,
                    pairToken = token,
                    deviceId = devId,
                    deviceLabel = devLabel,
                    pairedLabel = pLabel,
                    lastSyncOkAt = syncOk,
                    lastSyncErrorAt = syncErr
                )

                // Sync into SharedPreferences cache
                syncToPrefs(settings)
                return settings
            } catch (_: Exception) {
            }
        }

        // 2. Fallback to SharedPreferences
        val mobileLimit = if (prefs.contains(KEY_MOBILE_LIMIT)) prefs.getLong(KEY_MOBILE_LIMIT, 0L) else null
        val wifiLimit = if (prefs.contains(KEY_WIFI_LIMIT)) prefs.getLong(KEY_WIFI_LIMIT, 0L) else null

        return AppSettings(
            cycleStartDay = prefs.getInt(KEY_CYCLE_START_DAY, 1).coerceIn(1, 31),
            mobileLimitBytes = mobileLimit,
            mobileWarnAtPercent = prefs.getInt(KEY_MOBILE_WARN_PCT, 80),
            wifiLimitBytes = wifiLimit,
            wifiWarnAtPercent = prefs.getInt(KEY_WIFI_WARN_PCT, 80),
            showSystemApps = prefs.getBoolean(KEY_SHOW_SYSTEM_APPS, false),
            alertedKeys = prefs.getStringSet(KEY_ALERTED_KEYS, emptySet()) ?: emptySet(),
            language = savedLang ?: prefs.getString(KEY_LANGUAGE, "en") ?: "en",
            themeMode = prefs.getString(KEY_THEME_MODE, "system") ?: "system",
            familyRole = prefs.getString(KEY_FAMILY_ROLE, null),
            pairToken = prefs.getString(KEY_PAIR_TOKEN, null),
            deviceId = prefs.getString(KEY_DEVICE_ID, null),
            deviceLabel = prefs.getString(KEY_DEVICE_LABEL, null),
            pairedLabel = prefs.getString(KEY_PAIRED_LABEL, null),
            lastSyncOkAt = if (prefs.contains(KEY_LAST_SYNC_OK)) prefs.getLong(KEY_LAST_SYNC_OK, 0L) else null,
            lastSyncErrorAt = if (prefs.contains(KEY_LAST_SYNC_ERR)) prefs.getLong(KEY_LAST_SYNC_ERR, 0L) else null
        )
    }

    fun updateSettings(settings: AppSettings) {
        syncToPrefs(settings)
        syncToExpoStorage(settings)
    }

    private fun syncToPrefs(settings: AppSettings) {
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

        if (settings.familyRole != null) editor.putString(KEY_FAMILY_ROLE, settings.familyRole) else editor.remove(KEY_FAMILY_ROLE)
        if (settings.pairToken != null) editor.putString(KEY_PAIR_TOKEN, settings.pairToken) else editor.remove(KEY_PAIR_TOKEN)
        if (settings.deviceId != null) editor.putString(KEY_DEVICE_ID, settings.deviceId) else editor.remove(KEY_DEVICE_ID)
        if (settings.deviceLabel != null) editor.putString(KEY_DEVICE_LABEL, settings.deviceLabel) else editor.remove(KEY_DEVICE_LABEL)
        if (settings.pairedLabel != null) editor.putString(KEY_PAIRED_LABEL, settings.pairedLabel) else editor.remove(KEY_PAIRED_LABEL)
        if (settings.lastSyncOkAt != null) editor.putLong(KEY_LAST_SYNC_OK, settings.lastSyncOkAt) else editor.remove(KEY_LAST_SYNC_OK)
        if (settings.lastSyncErrorAt != null) editor.putLong(KEY_LAST_SYNC_ERR, settings.lastSyncErrorAt) else editor.remove(KEY_LAST_SYNC_ERR)

        editor.apply()
    }

    private fun syncToExpoStorage(settings: AppSettings) {
        try {
            // Read existing JSON if any to preserve other fields (e.g. childLimits, pushToken, etc.)
            val raw = ExpoStorageBridge.getItem(context, KEY_EXPO_SETTINGS)
            val json = if (raw != null) JSONObject(raw) else JSONObject()

            json.put("cycleStartDay", settings.cycleStartDay)
            if (settings.mobileLimitBytes != null) json.put("mobileLimitBytes", settings.mobileLimitBytes) else json.put("mobileLimitBytes", JSONObject.NULL)
            json.put("mobileWarnAtPercent", settings.mobileWarnAtPercent)
            if (settings.wifiLimitBytes != null) json.put("wifiLimitBytes", settings.wifiLimitBytes) else json.put("wifiLimitBytes", JSONObject.NULL)
            json.put("wifiWarnAtPercent", settings.wifiWarnAtPercent)
            json.put("showSystemApps", settings.showSystemApps)
            json.put("alertedKeys", JSONArray(settings.alertedKeys))

            if (settings.familyRole != null) json.put("familyRole", settings.familyRole)
            if (settings.pairToken != null) json.put("pairToken", settings.pairToken)
            if (settings.deviceId != null) json.put("deviceId", settings.deviceId)
            if (settings.deviceLabel != null) json.put("deviceLabel", settings.deviceLabel)
            if (settings.pairedLabel != null) json.put("pairedLabel", settings.pairedLabel)
            if (settings.lastSyncOkAt != null) json.put("lastSyncOkAt", settings.lastSyncOkAt)
            if (settings.lastSyncErrorAt != null) json.put("lastSyncErrorAt", settings.lastSyncErrorAt)

            ExpoStorageBridge.setItem(context, KEY_EXPO_SETTINGS, json.toString())
            ExpoStorageBridge.setItem(context, KEY_EXPO_LANG, settings.language)
        } catch (_: Exception) {
        }
    }

    fun markAlertKey(key: String) {
        val current = prefs.getStringSet(KEY_ALERTED_KEYS, emptySet())?.toMutableSet() ?: mutableSetOf()
        current.add(key)
        prefs.edit().putStringSet(KEY_ALERTED_KEYS, current).apply()
        val s = loadSettings().copy(alertedKeys = current)
        syncToExpoStorage(s)
    }

    fun resetAlertKeys(keysToKeep: Set<String> = emptySet()) {
        prefs.edit().putStringSet(KEY_ALERTED_KEYS, keysToKeep).apply()
        val s = loadSettings().copy(alertedKeys = keysToKeep)
        syncToExpoStorage(s)
    }

    companion object {
        private const val PREFS_NAME = "nettrack_settings"
        private const val KEY_EXPO_SETTINGS = "settings.v1"
        private const val KEY_EXPO_LANG = "language.v1"

        private const val KEY_CYCLE_START_DAY = "cycleStartDay"
        private const val KEY_MOBILE_LIMIT = "mobileLimitBytes"
        private const val KEY_MOBILE_WARN_PCT = "mobileWarnAtPercent"
        private const val KEY_WIFI_LIMIT = "wifiLimitBytes"
        private const val KEY_WIFI_WARN_PCT = "wifiWarnAtPercent"
        private const val KEY_SHOW_SYSTEM_APPS = "showSystemApps"
        private const val KEY_ALERTED_KEYS = "alertedKeys"
        private const val KEY_LANGUAGE = "language"
        private const val KEY_THEME_MODE = "themeMode"
        private const val KEY_FAMILY_ROLE = "familyRole"
        private const val KEY_PAIR_TOKEN = "pairToken"
        private const val KEY_DEVICE_ID = "deviceId"
        private const val KEY_DEVICE_LABEL = "deviceLabel"
        private const val KEY_PAIRED_LABEL = "pairedLabel"
        private const val KEY_LAST_SYNC_OK = "lastSyncOkAt"
        private const val KEY_LAST_SYNC_ERR = "lastSyncErrorAt"

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
