package com.anonymous.network_tracker.data.util

import java.util.Calendar

enum class PresetId(val id: String) {
    TODAY("today"),
    YESTERDAY("yesterday"),
    LAST_24H("last24h"),
    LAST_7D("last7d"),
    LAST_30D("last30d"),
    THIS_CYCLE("thisCycle"),
    LAST_CYCLE("lastCycle"),
    CUSTOM("custom")
}

data class DateRange(
    val start: Long,
    val end: Long,
    val preset: PresetId = PresetId.CUSTOM
)

object RangeUtils {

    const val DAY_MS = 86_400_000L
    private const val RETENTION_DAYS = 80

    fun midnight(ts: Long, dayOffset: Int = 0): Long {
        val cal = Calendar.getInstance().apply {
            timeInMillis = ts
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            if (dayOffset != 0) add(Calendar.DAY_OF_YEAR, dayOffset)
        }
        return cal.timeInMillis
    }

    fun calendarDayRange(ts: Long, dayOffset: Int = 0): DateRange {
        return DateRange(
            start = midnight(ts, dayOffset),
            end = midnight(ts, dayOffset + 1),
            preset = PresetId.CUSTOM
        )
    }

    fun cycleStart(cycleStartDay: Int, now: Long, monthsBack: Int): Long {
        val cal = Calendar.getInstance().apply {
            timeInMillis = now
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            set(Calendar.DAY_OF_MONTH, 1)
            add(Calendar.MONTH, -monthsBack)
            val daysInMonth = getActualMaximum(Calendar.DAY_OF_MONTH)
            set(Calendar.DAY_OF_MONTH, minOf(cycleStartDay, daysInMonth))
        }
        return cal.timeInMillis
    }

    private fun cycleBase(cycleStartDay: Int, now: Long): Int {
        return if (cycleStart(cycleStartDay, now, 0) <= now) 0 else 1
    }

    fun billingCycleRange(cycleStartDay: Int, now: Long, offset: Int = 0): DateRange {
        val base = cycleBase(cycleStartDay, now)
        val start = cycleStart(cycleStartDay, now, base - offset)
        val end = if (offset == 0) now else cycleStart(cycleStartDay, now, base - offset - 1)
        return DateRange(
            start = start,
            end = end,
            preset = if (offset == 0) PresetId.THIS_CYCLE else PresetId.LAST_CYCLE
        )
    }

    fun nextCycleStart(cycleStartDay: Int, now: Long): Long {
        return cycleStart(cycleStartDay, now, cycleBase(cycleStartDay, now) - 1)
    }

    fun presetRange(preset: PresetId, now: Long = System.currentTimeMillis(), cycleStartDay: Int = 1): DateRange {
        return when (preset) {
            PresetId.TODAY -> DateRange(midnight(now), now, preset)
            PresetId.YESTERDAY -> DateRange(midnight(now, -1), midnight(now), preset)
            PresetId.LAST_24H -> DateRange(now - DAY_MS, now, preset)
            PresetId.LAST_7D -> DateRange(midnight(now, -6), now, preset)
            PresetId.LAST_30D -> DateRange(midnight(now, -29), now, preset)
            PresetId.THIS_CYCLE -> billingCycleRange(cycleStartDay, now, 0)
            PresetId.LAST_CYCLE -> billingCycleRange(cycleStartDay, now, -1)
            PresetId.CUSTOM -> DateRange(midnight(now), now, preset)
        }
    }

    fun archiveCutoff(now: Long = System.currentTimeMillis()): Long {
        val cal = Calendar.getInstance().apply {
            timeInMillis = now
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            add(Calendar.DAY_OF_YEAR, -RETENTION_DAYS)
        }
        return cal.timeInMillis
    }

    fun historyCutoff(now: Long = System.currentTimeMillis()): Long {
        val cal = Calendar.getInstance().apply {
            timeInMillis = now
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            set(Calendar.DAY_OF_MONTH, 1)
            add(Calendar.MONTH, -7)
            val lastDay = getActualMaximum(Calendar.DAY_OF_MONTH)
            val todayDay = Calendar.getInstance().apply { timeInMillis = now }.get(Calendar.DAY_OF_MONTH)
            set(Calendar.DAY_OF_MONTH, minOf(todayDay, lastDay))
        }
        return cal.timeInMillis
    }

    data class RangeSplit(val archived: DateRange?, val live: DateRange?)

    fun splitRange(range: DateRange, cutoff: Long = archiveCutoff()): RangeSplit {
        if (range.end <= cutoff) return RangeSplit(archived = range, live = null)
        if (range.start >= cutoff) return RangeSplit(archived = null, live = range)
        return RangeSplit(
            archived = DateRange(range.start, cutoff, range.preset),
            live = DateRange(cutoff, range.end, range.preset)
        )
    }
}
