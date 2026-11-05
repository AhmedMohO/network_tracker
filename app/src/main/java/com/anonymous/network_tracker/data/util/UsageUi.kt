package com.anonymous.network_tracker.data.util

import com.anonymous.network_tracker.data.model.AppUsageItem
import java.time.Instant
import kotlin.math.ceil
import kotlin.math.max

data class CycleProjection(
    val usedBytes: Long,
    val limitBytes: Long,
    val remainingMs: Long,
    val remainingDays: Int,
    val remainingHours: Int,
    val dailyPaceBytes: Long,
    val projectedRemainingBytes: Long,
    val projectedTotalBytes: Long,
    val remainingAllowanceBytes: Long,
    val safeDailyAllowanceBytes: Long,
    val isOverLimit: Boolean,
    val willExceed: Boolean,
    val excessBytes: Long,
    val bufferBytes: Long
)

/**
 * Calculates a realistic data usage projection for the remainder of the current billing cycle.
 *
 * To avoid extreme extrapolation distortions during the first hours of a billing cycle (e.g.
 * downloading a 1 GB update 15 minutes after cycle renewal extrapolating naively to 2,880 GB/month),
 * daily pace calculation enforces a minimum baseline window of 1 full day (circadian periodicity).
 *
 * Similarly, as the cycle draws to an end (< 24 hours remaining), remaining usage scales
 * fractionally by remaining time rather than blindly projecting a full day's quota.
 */
fun calculateCycleProjection(
    usedBytes: Long,
    limitBytes: Long,
    cycleStartDay: Int,
    now: Long = System.currentTimeMillis()
): CycleProjection {
    val cycleRange = RangeUtils.billingCycleRange(cycleStartDay, now, 0)
    val cycleStart = cycleRange.start
    val cycleEnd = RangeUtils.nextCycleStart(cycleStartDay, now)
    val totalSpanMs = max(1L, cycleEnd - cycleStart)
    val elapsedMs = (now - cycleStart).coerceIn(0L, totalSpanMs)
    val remainingMs = (cycleEnd - now).coerceAtLeast(0L)

    val elapsedDays = elapsedMs.toDouble() / RangeUtils.DAY_MS
    val remainingDaysFraction = remainingMs.toDouble() / RangeUtils.DAY_MS
    val remainingDays = ceil(remainingDaysFraction).toInt().coerceAtLeast(0)
    val remainingHours = max(1, (remainingMs / 3_600_000L).toInt())

    // Circadian damping: network traffic follows a daily rhythm (awake/sleep).
    // Using a minimum effective elapsed duration of 1.0 day prevents wild bursts
    // in the first hours of a cycle from producing absurd multi-terabyte projections.
    val effectiveElapsedDays = max(1.0, elapsedDays)
    val dailyPaceBytes = if (usedBytes > 0L && effectiveElapsedDays > 0.0) {
        (usedBytes.toDouble() / effectiveElapsedDays).toLong()
    } else {
        0L
    }

    val projectedRemainingBytes = if (remainingMs > 0L && dailyPaceBytes > 0L) {
        (dailyPaceBytes.toDouble() * remainingDaysFraction).toLong()
    } else {
        0L
    }

    val projectedTotalBytes = usedBytes + projectedRemainingBytes
    val remainingAllowanceBytes = max(0L, limitBytes - usedBytes)
    val safeDailyAllowanceBytes = if (remainingDaysFraction > 0.05 && remainingAllowanceBytes > 0L) {
        (remainingAllowanceBytes.toDouble() / remainingDaysFraction).toLong()
    } else {
        remainingAllowanceBytes
    }

    val isOverLimit = limitBytes > 0L && usedBytes >= limitBytes
    val willExceed = limitBytes > 0L && projectedTotalBytes > limitBytes
    val excessBytes = if (limitBytes > 0L && projectedTotalBytes > limitBytes) {
        projectedTotalBytes - limitBytes
    } else {
        0L
    }
    val bufferBytes = if (limitBytes > 0L && projectedTotalBytes < limitBytes) {
        limitBytes - projectedTotalBytes
    } else {
        0L
    }

    return CycleProjection(
        usedBytes = usedBytes,
        limitBytes = limitBytes,
        remainingMs = remainingMs,
        remainingDays = remainingDays,
        remainingHours = remainingHours,
        dailyPaceBytes = dailyPaceBytes,
        projectedRemainingBytes = projectedRemainingBytes,
        projectedTotalBytes = projectedTotalBytes,
        remainingAllowanceBytes = remainingAllowanceBytes,
        safeDailyAllowanceBytes = safeDailyAllowanceBytes,
        isOverLimit = isOverLimit,
        willExceed = willExceed,
        excessBytes = excessBytes,
        bufferBytes = bufferBytes
    )
}

fun customRangeProblem(start: Long, end: Long, now: Long): String? = when {
    start >= end -> "The start must be before the end."
    end > now -> "The range cannot end in the future."
    end - start > 366L * RangeUtils.DAY_MS -> "Choose a range of one year or less."
    else -> null
}

fun quotaPercent(used: Long, limit: Long): Double = if (limit > 0) used.toDouble() / limit * 100 else 0.0

object UsageExport {
    private fun csv(value: String): String {
        val safe = if (Regex("^[\\t\\r\\n]|^\\s*[=+@-]").containsMatchIn(value)) "'$value" else value
        return if (safe.any { it in ",\"\r\n" }) "\"${safe.replace("\"", "\"\"")}\"" else safe
    }

    private fun json(value: String): String = buildString {
        append('"')
        value.forEach { c ->
            when (c) {
                '"' -> append("\\\"")
                '\\' -> append("\\\\")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> if (c < ' ') append("\\u%04x".format(c.code)) else append(c)
            }
        }
        append('"')
    }

    fun toCsv(apps: List<AppUsageItem>, range: DateRange, network: String): String = buildString {
        append("app,package,uid,network,range_start,range_end,download_bytes,upload_bytes,total_bytes,foreground_bytes,background_bytes\n")
        apps.forEach { a ->
            append(listOf(csv(a.name), csv(a.packageName.orEmpty()), a.uid, network,
                Instant.ofEpochMilli(range.start), Instant.ofEpochMilli(range.end),
                a.download, a.upload, a.total, a.foreground, a.background).joinToString(","))
            append('\n')
        }
    }

    fun toJson(apps: List<AppUsageItem>, range: DateRange, network: String): String =
        "{\"exportedAt\":${json(Instant.now().toString())},\"network\":${json(network)}," +
            "\"rangeStart\":${json(Instant.ofEpochMilli(range.start).toString())},\"rangeEnd\":${json(Instant.ofEpochMilli(range.end).toString())}," +
            "\"apps\":[" + apps.joinToString(",") { a ->
                "{\"uid\":${a.uid},\"name\":${json(a.name)},\"packageName\":${a.packageName?.let(::json) ?: "null"}," +
                    "\"download\":${a.download},\"upload\":${a.upload},\"total\":${a.total},\"foreground\":${a.foreground},\"background\":${a.background}}"
            } + "]}"
}
