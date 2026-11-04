package com.anonymous.network_tracker.ui.screens

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.anonymous.network_tracker.core.UsageAccess
import com.anonymous.network_tracker.data.repository.SettingsRepository
import com.anonymous.network_tracker.data.repository.UsageRepository
import com.anonymous.network_tracker.data.util.RangeUtils
import com.anonymous.network_tracker.service.SyncKeepAlive
import com.anonymous.network_tracker.service.WifiSessions
import com.anonymous.network_tracker.service.WifiWatchService
import com.anonymous.network_tracker.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

@Composable
fun SettingsScreen(
    onNavigateToFamily: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val settingsRepo = remember(context) { SettingsRepository.getInstance(context) }
    val usageRepo = remember(context) { UsageRepository.getInstance(context) }
    val scope = rememberCoroutineScope()

    var settings by remember { mutableStateOf(settingsRepo.loadSettings()) }
    var wifiWatchEnabled by remember { mutableStateOf(WifiSessions.isEnabled(context)) }
    var keepAliveEnabled by remember { mutableStateOf(SyncKeepAlive.isEnabled(context)) }
    var wifiProblem by remember { mutableStateOf(WifiWatchService.problem(context)) }
    var isIgnoringBattery by remember { mutableStateOf(SyncKeepAlive.isIgnoringBatteryOptimizations(context)) }
    var exportStatus by remember { mutableStateOf<String?>(null) }

    fun shareCsv(file: File) {
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.apkprovider",
            file
        )
        val sendIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(sendIntent, "Export Usage Archive"))
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
                    text = "Settings",
                    color = TextPrimary,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Tracking preferences & limits",
                    color = TextSecondary,
                    fontSize = 14.sp
                )
            }

            // Wi-Fi Tracking Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface)
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Wi-Fi Network Watch",
                                color = TextPrimary,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = "Records per-SSID usage with foreground service",
                                color = TextMuted,
                                fontSize = 12.sp
                            )
                        }
                        Switch(
                            checked = wifiWatchEnabled,
                            onCheckedChange = { checked ->
                                wifiWatchEnabled = checked
                                WifiSessions.setEnabled(context, checked)
                                WifiWatchService.sync(context)
                                wifiProblem = WifiWatchService.problem(context)
                            },
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = TextPrimary,
                                checkedTrackColor = AccentPrimary
                            )
                        )
                    }

                    if (wifiWatchEnabled && wifiProblem != null) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = when (wifiProblem) {
                                "permission" -> "Fine location permission required to read Wi-Fi names."
                                "locationOff" -> "System location service is switched off."
                                "background" -> "Background location permission required for continuous watch."
                                else -> "Wi-Fi tracking issue: $wifiProblem"
                            },
                            color = WarningAmber,
                            fontSize = 12.sp
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(
                            onClick = {
                                WifiWatchService.openFix(context)
                                wifiProblem = WifiWatchService.problem(context)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceVariant),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("Fix Permission Issue", color = AccentSecondary, fontSize = 12.sp)
                        }
                    }
                }
            }

            // Reliable Background Sync Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface)
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Reliable Background Sync",
                                color = TextPrimary,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = "Keeps hourly checks on schedule under Doze",
                                color = TextMuted,
                                fontSize = 12.sp
                            )
                        }
                        Switch(
                            checked = keepAliveEnabled,
                            onCheckedChange = { checked ->
                                keepAliveEnabled = checked
                                SyncKeepAlive.setEnabled(context, checked)
                                WifiWatchService.sync(context)
                            },
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = TextPrimary,
                                checkedTrackColor = AccentPrimary
                            )
                        )
                    }

                    if (!isIgnoringBattery) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Button(
                            onClick = {
                                SyncKeepAlive.requestIgnoreBatteryOptimizations(context)
                                isIgnoringBattery = SyncKeepAlive.isIgnoringBatteryOptimizations(context)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceVariant),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("Exempt from Battery Optimization", color = AccentSecondary, fontSize = 12.sp)
                        }
                    }
                }
            }

            // Family Management Shortcut
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(18.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Family Sharing & Pairing",
                            color = TextPrimary,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = "Sync usage between parent and children devices",
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                    }
                    Button(
                        onClick = onNavigateToFamily,
                        colors = ButtonDefaults.buttonColors(containerColor = AccentPrimary),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("Open Family", color = TextPrimary, fontSize = 13.sp)
                    }
                }
            }

            // Export Data Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface)
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Text(
                        text = "Data Management",
                        color = TextPrimary,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Export your local network usage archive as a CSV file.",
                        color = TextMuted,
                        fontSize = 12.sp
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        onClick = {
                            scope.launch {
                                val allUsage = usageRepo.getUsage(RangeUtils.presetRange(com.anonymous.network_tracker.data.util.PresetId.LAST_30D))
                                withContext(Dispatchers.IO) {
                                    val csvContent = buildString {
                                        append("UID,Application,Package,DownloadBytes,UploadBytes,TotalBytes\n")
                                        allUsage.forEach {
                                            append("${it.uid},\"${it.name}\",\"${it.packageName ?: ""}\",${it.download},${it.upload},${it.total}\n")
                                        }
                                    }
                                    val exportFile = File(context.cacheDir, "network_usage_export.csv")
                                    exportFile.writeText(csvContent)
                                    withContext(Dispatchers.Main) {
                                        shareCsv(exportFile)
                                    }
                                }
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceVariant),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Share,
                            contentDescription = null,
                            tint = AccentSecondary,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Export CSV Archive", color = AccentSecondary, fontSize = 13.sp)
                    }
                }
            }

            // App Version Info
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "NetTrack v2.0.0 (Native Kotlin)",
                    color = TextMuted,
                    fontSize = 13.sp
                )
            }
        }
    }
}
