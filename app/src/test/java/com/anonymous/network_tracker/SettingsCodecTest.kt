package com.anonymous.network_tracker

import com.anonymous.network_tracker.data.repository.AppSettings
import com.anonymous.network_tracker.data.repository.SettingsCodec
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SettingsCodecTest {
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
