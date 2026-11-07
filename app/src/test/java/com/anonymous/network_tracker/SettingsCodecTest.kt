package com.anonymous.network_tracker

import com.anonymous.network_tracker.data.repository.AppSettings
import com.anonymous.network_tracker.data.repository.SettingsCodec
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SettingsCodecTest {
    @Test fun wifiLimitSelectionRoundTripsWithoutChangingTheSharedQuota() {
        val json = JSONObject("""{"wifiLimitBytes":12345,"wifiWarnAtPercent":70,"wifiLimitSsid":"منزل: Home \"5G\"","futureSetting":9}""")
        val loaded = SettingsCodec.decode(json, AppSettings())
        SettingsCodec.encode(json, loaded.copy(showSystemApps = true))
        assertEquals("منزل: Home \"5G\"", json.optString("wifiLimitSsid"))
        val restored = SettingsCodec.decode(json, AppSettings())
        assertEquals("منزل: Home \"5G\"", restored.wifiLimitSsid)
        assertEquals(12345L, restored.wifiLimitBytes)
        assertEquals(70, restored.wifiWarnAtPercent)
        assertEquals(9, json.getInt("futureSetting"))
    }

    @Test fun legacySettingsDefaultToAllWifiAndTheSelectionCanBeCleared() {
        assertNull(SettingsCodec.decode(JSONObject("""{"wifiLimitBytes":12345}"""), AppSettings()).wifiLimitSsid)
        val json = JSONObject("""{"wifiLimitSsid":"Home"}""")
        SettingsCodec.encode(json, AppSettings())
        assertTrue(json.isNull("wifiLimitSsid"))
    }
    @Test fun legacyWarningPercentageSurvivesUpgrade() {
        assertEquals(45, SettingsCodec.decode(JSONObject("{\"warnAtPercent\":45}"), AppSettings()).mobileWarnAtPercent)
    }
    @Test fun clearingPairingPersistsNullAndKeepsUnknownFields() {
        val json = JSONObject("{\"familyRole\":\"child\",\"pairToken\":\"secret\",\"childLimits\":{\"kid\":123}}")
        SettingsCodec.encode(json, AppSettings())
        assertTrue(json.isNull("familyRole"))
        assertTrue(json.isNull("pairToken"))
        assertEquals(123, json.getJSONObject("childLimits").getInt("kid"))
    }
    @Test fun languageAndThemeArePartOfCanonicalSettings() {
        val json = SettingsCodec.encode(JSONObject(), AppSettings(language="ar", themeMode="light"))
        val settings = SettingsCodec.decode(json, AppSettings())
        assertEquals("ar", settings.language)
        assertEquals("light", settings.themeMode)
    }
}
