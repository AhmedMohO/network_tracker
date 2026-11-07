package com.anonymous.network_tracker.data.repository

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

class SettingsRepository(private val context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun fallback(): AppSettings = AppSettings(
        cycleStartDay = prefs.getInt(KEY_CYCLE_START_DAY,1).coerceIn(1,31),
        mobileLimitBytes = if(prefs.contains(KEY_MOBILE_LIMIT)) prefs.getLong(KEY_MOBILE_LIMIT,0) else null,
        mobileWarnAtPercent = prefs.getInt(KEY_MOBILE_WARN_PCT,80),
        wifiLimitBytes = if(prefs.contains(KEY_WIFI_LIMIT)) prefs.getLong(KEY_WIFI_LIMIT,0) else null,
        wifiWarnAtPercent = prefs.getInt(KEY_WIFI_WARN_PCT,80),
        wifiLimitSsid = prefs.getString(KEY_WIFI_LIMIT_SSID, null),
        showSystemApps = prefs.getBoolean(KEY_SHOW_SYSTEM_APPS,false),
        alertedKeys = prefs.getStringSet(KEY_ALERTED_KEYS,emptySet())?.toSet() ?: emptySet(),
        language = ExpoStorageBridge.getItem(context,KEY_EXPO_LANG) ?: prefs.getString(KEY_LANGUAGE,null)
            ?: java.util.Locale.getDefault().language.takeIf { it == "ar" || it == "en" } ?: "en",
        themeMode = prefs.getString(KEY_THEME_MODE,"system") ?: "system",
        familyRole = prefs.getString(KEY_FAMILY_ROLE,null), pairToken = prefs.getString(KEY_PAIR_TOKEN,null),
        deviceId = prefs.getString(KEY_DEVICE_ID,null), deviceLabel = prefs.getString(KEY_DEVICE_LABEL,null),
        pairedLabel = prefs.getString(KEY_PAIRED_LABEL,null),
        lastSyncOkAt = if(prefs.contains(KEY_LAST_SYNC_OK)) prefs.getLong(KEY_LAST_SYNC_OK,0) else null,
        lastSyncErrorAt = if(prefs.contains(KEY_LAST_SYNC_ERR)) prefs.getLong(KEY_LAST_SYNC_ERR,0) else null
    )

    // SQLite is canonical; an unreadable database must never be replaced with defaults.
    private fun readJson(): JSONObject {
        val raw = ExpoStorageBridge.getItem(context,KEY_EXPO_SETTINGS)
        return if(raw != null) JSONObject(raw) else SettingsCodec.encode(JSONObject(),fallback())
    }

    @Synchronized fun loadSettings(): AppSettings = SettingsCodec.decode(readJson(),fallback())

    @Synchronized fun update(transform: (AppSettings) -> AppSettings): AppSettings = updateWithExtras { settings, _ -> transform(settings) }

    @Synchronized fun updateWithExtras(transform: (AppSettings, JSONObject) -> AppSettings): AppSettings {
        val json = readJson()
        val next = transform(SettingsCodec.decode(json,fallback()), json)
        persist(SettingsCodec.encode(json,next))
        return next
    }

    @Synchronized fun readExtras(): JSONObject = JSONObject(readJson().toString())

    @Synchronized fun patchExtras(patch: JSONObject) {
        val json = readJson()
        patch.keys().forEach { key -> json.put(key,patch.get(key)) }
        persist(json)
    }

    private fun persist(json: JSONObject) {
        val settings = SettingsCodec.decode(json,fallback())
        ExpoStorageBridge.setItems(context,mapOf(KEY_EXPO_SETTINGS to json.toString(),KEY_EXPO_LANG to settings.language))
        syncToPrefs(settings)
    }

    fun markAlertKey(key: String) { update { it.copy(alertedKeys = it.alertedKeys + key) } }
    fun resetAlertKeys(keysToKeep: Set<String> = emptySet()) { update { it.copy(alertedKeys = keysToKeep) } }

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
        if (settings.wifiLimitSsid != null) editor.putString(KEY_WIFI_LIMIT_SSID, settings.wifiLimitSsid)
        else editor.remove(KEY_WIFI_LIMIT_SSID)

        if (settings.familyRole != null) editor.putString(KEY_FAMILY_ROLE, settings.familyRole) else editor.remove(KEY_FAMILY_ROLE)
        if (settings.pairToken != null) editor.putString(KEY_PAIR_TOKEN, settings.pairToken) else editor.remove(KEY_PAIR_TOKEN)
        if (settings.deviceId != null) editor.putString(KEY_DEVICE_ID, settings.deviceId) else editor.remove(KEY_DEVICE_ID)
        if (settings.deviceLabel != null) editor.putString(KEY_DEVICE_LABEL, settings.deviceLabel) else editor.remove(KEY_DEVICE_LABEL)
        if (settings.pairedLabel != null) editor.putString(KEY_PAIRED_LABEL, settings.pairedLabel) else editor.remove(KEY_PAIRED_LABEL)
        if (settings.lastSyncOkAt != null) editor.putLong(KEY_LAST_SYNC_OK, settings.lastSyncOkAt) else editor.remove(KEY_LAST_SYNC_OK)
        if (settings.lastSyncErrorAt != null) editor.putLong(KEY_LAST_SYNC_ERR, settings.lastSyncErrorAt) else editor.remove(KEY_LAST_SYNC_ERR)

        editor.apply()
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
        private const val KEY_WIFI_LIMIT_SSID = "wifiLimitSsid"
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
                INSTANCE?.let { return@synchronized it }
                val instance = SettingsRepository(context.applicationContext)
                INSTANCE = instance
                instance
            }
        }
    }
}
