package com.anonymous.network_tracker.data.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index

@Entity(
    tableName = "daily_usage",
    primaryKeys = ["day_start", "uid", "network", "ssid"],
    indices = [Index(value = ["day_start"], name = "idx_daily_day")]
)
data class DailyUsageEntity(
    @ColumnInfo(name = "day_start") val dayStart: Long,
    @ColumnInfo(name = "uid") val uid: Int,
    @ColumnInfo(name = "network") val network: String,
    @ColumnInfo(name = "ssid") val ssid: String = "",
    @ColumnInfo(name = "app_name") val appName: String? = null,
    @ColumnInfo(name = "package_name") val packageName: String? = null,
    @ColumnInfo(name = "download") val download: Long,
    @ColumnInfo(name = "upload") val upload: Long
)
