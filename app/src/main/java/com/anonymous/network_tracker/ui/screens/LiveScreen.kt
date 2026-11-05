package com.anonymous.network_tracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.geometry.Offset
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
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import com.anonymous.network_tracker.ui.LaunchedOnResumeEffect
import com.anonymous.network_tracker.data.model.AppUsageItem
import com.anonymous.network_tracker.data.util.DateRange
import com.anonymous.network_tracker.ui.components.UsageError
import com.anonymous.network_tracker.ui.components.AppIconImage

@Composable
fun LiveScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val repo = remember(context) { UsageRepository.getInstance(context) }

    var downloadSpeedBps by remember { mutableLongStateOf(0L) }
    var uploadSpeedBps by remember { mutableLongStateOf(0L) }
    var connectionType by remember { mutableStateOf("NONE") }
    var batteryLevel by remember { mutableStateOf<Int?>(null) }
    var fgApp by remember { mutableStateOf<String?>(null) }

    var history by remember { mutableStateOf<List<Pair<Long, Long>>>(emptyList()) }
    var apps by remember { mutableStateOf<List<AppUsageItem>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var retry by remember { mutableIntStateOf(0) }
    LaunchedOnResumeEffect(context) {
        var lastCounters = LiveProbe.counters()
        var lastTime = android.os.SystemClock.elapsedRealtime()
        while (true) {
            delay(1000)
            val now = android.os.SystemClock.elapsedRealtime()
            val elapsed = (now - lastTime).coerceAtLeast(1) / 1000.0
            val current = LiveProbe.counters()
            val down = ((current["totalRx"] ?: 0) - (lastCounters["totalRx"] ?: 0)).coerceAtLeast(0)
            val up = ((current["totalTx"] ?: 0) - (lastCounters["totalTx"] ?: 0)).coerceAtLeast(0)
            downloadSpeedBps = (down / elapsed).toLong()
            uploadSpeedBps = (up / elapsed).toLong()
            history = (history + (downloadSpeedBps to uploadSpeedBps)).takeLast(60)
            connectionType = LiveProbe.connection(context)
            batteryLevel = LiveProbe.batteryPercent(context)
            fgApp = withContext(Dispatchers.IO) { LiveProbe.foregroundPackage(context) }
            lastCounters = current
            lastTime = now
        }
    }
    LaunchedOnResumeEffect(context, retry) {
        while (true) {
            try {
                val now = System.currentTimeMillis()
                apps = repo.getUsage(DateRange(now - 10_000, now), "ALL").filter { it.total > 0 }.take(8)
                error = null
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { apps = emptyList(); error = e.message ?: e.javaClass.simpleName }
            delay(2_000)
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
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Column {
                Text(
                    text = tr("Live Monitor"),
                    color = TextPrimary,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = tr("Real-time network transfer & status"),
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
                        text = tr("Current Throughput"),
                        color = TextSecondary,
                        fontSize = 13.sp
                    )
                    Spacer(modifier = Modifier.height(14.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        SpeedGaugeItem(
                            title = tr("Download"),
                            speedFormatted = "${repo.formatBytes(downloadSpeedBps)}/s",
                            icon = Icons.Default.ArrowDownward,
                            color = SuccessGreen
                        )
                        SpeedGaugeItem(
                            title = tr("Upload"),
                            speedFormatted = "${repo.formatBytes(uploadSpeedBps)}/s",
                            icon = Icons.Default.ArrowUpward,
                            color = AccentSecondary
                        )
                    }
                }
            }

            TrafficHistory(history)
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(tr("Recent app activity (last 10 seconds)"), color = TextPrimary)
                    Text(tr("Bytes attributed by Android, not per-app speed."), color = TextMuted)
                    UsageError(error) { retry++ }
                    if (apps.isEmpty() && error == null) Text(tr("No recent app traffic."), color = TextSecondary)
                    apps.forEach { app ->
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            AppIconImage(app.packageName, app.name, size = 32.dp)
                            Text(app.name, Modifier.weight(1f).padding(horizontal = 8.dp), color = TextPrimary)
                            Text(repo.formatBytes(app.total), color = AccentSecondary)
                        }
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
                        text = tr("Device & Network Context"),
                        color = TextPrimary,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(14.dp))
                    ContextRow(
                        icon = if (connectionType == "WIFI") Icons.Default.Wifi else Icons.Default.SignalCellularAlt,
                        label = tr("Active Transport"),
                        value = tr(connectionType),
                        valueColor = if (connectionType == "WIFI") WifiPurple else MobileBlue
                    )
                    Divider(color = DarkBorder, modifier = Modifier.padding(vertical = 10.dp))
                    ContextRow(
                        icon = Icons.Default.BatteryFull,
                        label = tr("Battery Level"),
                        value = batteryLevel?.let { "$it%" } ?: tr("Unknown"),
                        valueColor = TextPrimary
                    )
                    Divider(color = DarkBorder, modifier = Modifier.padding(vertical = 10.dp))
                    ContextRow(
                        icon = Icons.Default.SignalCellularAlt,
                        label = tr("Foreground App"),
                        value = fgApp ?: tr("None (Background)"),
                        valueColor = TextSecondary
                    )
                }
            }
        }
    }
}

@Composable
fun TrafficHistory(history: List<Pair<Long, Long>>) {
    val downColor = AccentPrimary
    val upColor = AccentSecondary
    Column {
        Text(tr("Last 60 seconds"), color = TextSecondary)
        Canvas(Modifier.fillMaxWidth().height(100.dp)) {
            val peak = history.maxOfOrNull { maxOf(it.first, it.second) }?.coerceAtLeast(1) ?: 1
            fun point(i: Int, value: Long) = Offset(size.width * i / 59f, size.height * (1f - value.toFloat() / peak))
            history.zipWithNext().forEachIndexed { i, (a, b) ->
                drawLine(downColor, point(i, a.first), point(i + 1, b.first), 3f)
                drawLine(upColor, point(i, a.second), point(i + 1, b.second), 3f)
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

