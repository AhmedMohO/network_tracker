package com.anonymous.network_tracker.service

internal fun normalizeWifiSsid(raw: String?): String? = raw?.removeSurrounding("\"")
    ?.takeUnless { it.isBlank() || it == "<unknown ssid>" }

internal fun connectedWifiSsid(names: List<String?>, legacyName: () -> String?): String? =
    when (names.size) {
        0 -> null
        1 -> names.single() ?: legacyName()
        else -> names.distinct().singleOrNull()
    }
