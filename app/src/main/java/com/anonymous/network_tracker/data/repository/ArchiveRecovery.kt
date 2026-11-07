package com.anonymous.network_tracker.data.repository

import com.anonymous.network_tracker.data.util.RangeUtils

internal fun archiveDaysToSnapshot(now: Long, savedDays: Set<Long>): List<Long> {
    val cutoff = RangeUtils.archiveCutoff(now)
    val today = RangeUtils.midnight(now)
    val yesterday = RangeUtils.midnight(now, -1)
    return generateSequence(cutoff) { RangeUtils.midnight(it, 1) }.takeWhile { it < today }.filter {
        it == cutoff || it == yesterday || it !in savedDays
    }.toList()
}
