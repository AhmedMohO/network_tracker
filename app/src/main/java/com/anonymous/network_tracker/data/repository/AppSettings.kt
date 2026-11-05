package com.anonymous.network_tracker.data.repository

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

