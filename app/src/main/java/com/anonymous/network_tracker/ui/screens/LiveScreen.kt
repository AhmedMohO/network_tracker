package com.anonymous.network_tracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material.icons.filled.SignalCellularAlt
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anonymous.network_tracker.core.LiveProbe
import com.anonymous.network_tracker.data.repository.UsageRepository
import com.anonymous.network_tracker.ui.theme.*
import kotlinx.coroutines.delay

@Composable
fun LiveScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val repo = remember(context) { UsageRepository.getInstance(context) }

    var downloadSpeedBps by remember { mutableLongStateOf(0L) }
    var uploadSpeedBps by remember { mutableLongStateOf(0L) }
    var connectionType by remember { mutableStateOf("NONE") }
    var batteryLevel by remember { mutableStateOf<Int?>(null) }
    var fgApp by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        var lastCounters = LiveProbe.counters()
        var lastTime = System.currentTimeMillis()

        while (true) {
            delay(1000)
            val now = System.currentTimeMillis()
            val timeDiffSec = (now - lastTime).coerceAtLeast(1) / 1000.0
            val currentCounters = LiveProbe.counters()

            val rxDiff = ((currentCounters["totalRx"] ?: 0) - (lastCounters["totalRx"] ?: 0)).coerceAtLeast(0)
            val txDiff = ((currentCounters["totalTx"] ?: 0) - (lastCounters["totalTx"] ?: 0)).coerceAtLeast(0)

            downloadSpeedBps = (rxDiff / timeDiffSec).toLong()
            uploadSpeedBps = (txDiff / timeDiffSec).toLong()

            connectionType = LiveProbe.connection(context)
            batteryLevel = LiveProbe.batteryPercent(context)
            fgApp = LiveProbe.foregroundPackage(context)

            lastCounters = currentCounters
            lastTime = now
        }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = DarkBackground
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Column {
                Text(
                    text = "Live Monitor",
                    color = TextPrimary,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Real-time network transfer & status",
                    color = TextSecondary,
                    fontSize = 14.sp
                )
            }

            // Real-time Speed Gauges
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface)
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "Current Throughput",
                        color = TextSecondary,
                        fontSize = 13.sp
                    )
                    Spacer(modifier = Modifier.height(14.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        SpeedGaugeItem(
                            title = "Download",
                            speedFormatted = "${repo.formatBytes(downloadSpeedBps)}/s",
                            icon = Icons.Default.ArrowDownward,
                            color = SuccessGreen
                        )
                        SpeedGaugeItem(
                            title = "Upload",
                            speedFormatted = "${repo.formatBytes(uploadSpeedBps)}/s",
                            icon = Icons.Default.ArrowUpward,
                            color = AccentSecondary
                        )
                    }
                }
            }

            // Connection & Hardware Context
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface)
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Text(
                        text = "Device & Network Context",
                        color = TextPrimary,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(14.dp))
                    ContextRow(
                        icon = if (connectionType == "WIFI") Icons.Default.Wifi else Icons.Default.SignalCellularAlt,
                        label = "Active Transport",
                        value = connectionType,
                        valueColor = if (connectionType == "WIFI") WifiPurple else MobileBlue
                    )
                    Divider(color = DarkBorder, modifier = Modifier.padding(vertical = 10.dp))
                    ContextRow(
                        icon = Icons.Default.BatteryFull,
                        label = "Battery Level",
                        value = batteryLevel?.let { "$it%" } ?: "Unknown",
                        valueColor = TextPrimary
                    )
                    Divider(color = DarkBorder, modifier = Modifier.padding(vertical = 10.dp))
                    ContextRow(
                        icon = Icons.Default.SignalCellularAlt,
                        label = "Foreground App",
                        value = fgApp ?: "None (Background)",
                        valueColor = TextSecondary
                    )
                }
            }
        }
    }
}

@Composable
fun SpeedGaugeItem(
    title: String,
    speedFormatted: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    color: androidx.compose.ui.graphics.Color
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(28.dp)
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = title,
            color = TextSecondary,
            fontSize = 13.sp
        )
        Text(
            text = speedFormatted,
            color = TextPrimary,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
fun ContextRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String,
    valueColor: androidx.compose.ui.graphics.Color
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = TextSecondary,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(text = label, color = TextSecondary, fontSize = 14.sp)
        }
        Text(
            text = value,
            color = valueColor,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1
        )
    }
}
