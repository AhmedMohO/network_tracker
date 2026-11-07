package com.anonymous.network_tracker.data.util

import com.anonymous.network_tracker.data.model.WifiNetworkSlice

fun wifiLimitUsedBytes(networks: List<WifiNetworkSlice>, ssid: String?): Long =
    networks.filter { ssid == null || it.ssid == ssid }.sumOf { it.totals.total }
