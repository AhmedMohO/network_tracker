package com.anonymous.network_tracker.data.repository

import org.json.JSONArray
import org.json.JSONObject

object SettingsCodec {
    fun decode(json: JSONObject, fallback: AppSettings): AppSettings = fallback.copy(
        cycleStartDay = json.optInt("cycleStartDay", fallback.cycleStartDay).coerceIn(1,31),
        mobileLimitBytes = nullableLong(json, "mobileLimitBytes"),
        mobileWarnAtPercent = json.optInt("mobileWarnAtPercent", json.optInt("warnAtPercent",80)).coerceIn(1,100),
        wifiLimitBytes = nullableLong(json, "wifiLimitBytes"),
        wifiWarnAtPercent = json.optInt("wifiWarnAtPercent",80).coerceIn(1,100),
        showSystemApps = json.optBoolean("showSystemApps", false),
        language = json.optString("language", fallback.language),
        themeMode = json.optString("themeMode", fallback.themeMode),
        alertedKeys = json.optJSONArray("alertedKeys")?.let { a -> (0 until a.length()).map { a.getString(it) }.toSet() } ?: emptySet(),
        familyRole = nullableString(json,"familyRole"), pairToken = nullableString(json,"pairToken"),
        deviceId = nullableString(json,"deviceId"), deviceLabel = nullableString(json,"deviceLabel"),
        pairedLabel = nullableString(json,"pairedLabel"), lastSyncOkAt = nullableLong(json,"lastSyncOkAt"),
        lastSyncErrorAt = nullableLong(json,"lastSyncErrorAt")
    )
    fun encode(json: JSONObject, settings: AppSettings): JSONObject = json.apply {
        put("cycleStartDay", settings.cycleStartDay)
        put("mobileLimitBytes", settings.mobileLimitBytes ?: JSONObject.NULL)
        put("mobileWarnAtPercent", settings.mobileWarnAtPercent)
        put("wifiLimitBytes", settings.wifiLimitBytes ?: JSONObject.NULL)
        put("wifiWarnAtPercent", settings.wifiWarnAtPercent)
        put("showSystemApps", settings.showSystemApps)
        put("alertedKeys", JSONArray(settings.alertedKeys))
        put("language", settings.language)
        put("themeMode", settings.themeMode)
        put("familyRole", settings.familyRole ?: JSONObject.NULL)
        put("pairToken", settings.pairToken ?: JSONObject.NULL)
        put("deviceId", settings.deviceId ?: JSONObject.NULL)
        put("deviceLabel", settings.deviceLabel ?: JSONObject.NULL)
        put("pairedLabel", settings.pairedLabel ?: JSONObject.NULL)
        put("lastSyncOkAt", settings.lastSyncOkAt ?: JSONObject.NULL)
        put("lastSyncErrorAt", settings.lastSyncErrorAt ?: JSONObject.NULL)
    }
    private fun nullableString(json: JSONObject, key:String) = if(json.has(key) && !json.isNull(key)) json.getString(key) else null
    private fun nullableLong(json: JSONObject, key:String) = if(json.has(key) && !json.isNull(key)) json.getLong(key) else null
}
