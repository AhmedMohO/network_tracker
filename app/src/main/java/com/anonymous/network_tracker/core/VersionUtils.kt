package com.anonymous.network_tracker.core

object VersionUtils {

    fun parse(version: String): List<Int>? {
        val cleaned = version.trim().removePrefix("v").removePrefix("V")
        if (!cleaned.matches(Regex("""^\d+(\.\d+)*$"""))) return null
        return cleaned.split(".").mapNotNull { it.toIntOrNull() }
    }

    fun isNewerVersion(latestTag: String, currentVersion: String): Boolean {
        val latest = parse(latestTag) ?: return false
        val current = parse(currentVersion) ?: return false
        val length = maxOf(latest.size, current.size)
        for (i in 0 until length) {
            val a = latest.getOrElse(i) { 0 }
            val b = current.getOrElse(i) { 0 }
            if (a != b) return a > b
        }
        return false
    }
}

