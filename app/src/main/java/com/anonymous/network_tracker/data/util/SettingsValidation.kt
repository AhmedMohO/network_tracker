package com.anonymous.network_tracker.data.util

fun parseLimitGb(raw: String): Long? {
    val normalized = raw.trim().map { c ->
        when {
            c == ',' || c == '\u066b' -> '.'
            Character.digit(c, 10) >= 0 -> ('0'.code + Character.digit(c, 10)).toChar()
            else -> c
        }
    }.joinToString("")
    val value = normalized.toDoubleOrNull() ?: return null
    val bytes = value * 1_073_741_824.0
    return if (value.isFinite() && value > 0 && bytes >= 1 && bytes < Long.MAX_VALUE.toDouble()) bytes.toLong() else null
}
