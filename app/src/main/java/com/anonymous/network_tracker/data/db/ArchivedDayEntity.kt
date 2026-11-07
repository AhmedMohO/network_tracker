package com.anonymous.network_tracker.data.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "archived_days")
data class ArchivedDayEntity(
    @PrimaryKey @ColumnInfo(name = "day_start") val dayStart: Long,
    @ColumnInfo(name = "captured_at") val capturedAt: Long
)
