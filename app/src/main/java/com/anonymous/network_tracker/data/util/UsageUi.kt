package com.anonymous.network_tracker.data.util

import com.anonymous.network_tracker.data.model.AppUsageItem
import java.time.Instant

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
