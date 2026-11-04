package com.anonymous.network_tracker.data.model

data class UsageQuery(
    val start: Long = 0,
    val end: Long = 0,
    val network: String = "ALL" // MOBILE | WIFI | ALL
)

data class SeriesQuery(
    val start: Long = 0,
    val end: Long = 0,
    val network: String = "ALL",
    val bucketMs: Long = 3_600_000,
    val uid: Int? = null
)

data class WifiUsageQuery(
    val start: Long = 0,
    val end: Long = 0
)

data class AppUsageItem(
    val uid: Int,
    val name: String,
    val packageName: String?,
    val download: Long,
    val upload: Long,
    val total: Long,
    val foreground: Long = 0,
    val background: Long = 0,
    val percentage: Double = 0.0
)

data class WifiNetworkSlice(
    val ssid: String?,
    val apps: List<AppUsageItem>,
    val totals: UsageTotals
)

data class UsageTotals(
    val download: Long,
    val upload: Long,
    val total: Long
)

