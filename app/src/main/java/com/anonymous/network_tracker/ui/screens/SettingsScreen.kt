package com.anonymous.network_tracker.ui.screens

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.anonymous.network_tracker.core.UsageAccess
import com.anonymous.network_tracker.data.repository.AppSettings
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

private const val GB_BYTES = 1024L * 1024L * 1024L

@Composable
fun SettingsScreen(
    onNavigateToFamily: () -> Unit,
    onNavigateToUpdate: () -> Unit,
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

    // Dialog state for Cycle Day
    var showCycleDialog by remember { mutableStateOf(false) }
    var cycleDayDraft by remember { mutableStateOf(settings.cycleStartDay.toString()) }

    // Dialog state for Data Limit
    var showLimitDialogFor by remember { mutableStateOf<String?>(null) } // "MOBILE" or "WIFI"
    var limitGbDraft by remember { mutableStateOf("") }
    var warnPctDraft by remember { mutableStateOf("80") }

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

    // Cycle Day Dialog
    if (showCycleDialog) {
        AlertDialog(
            onDismissRequest = { showCycleDialog = false },
            title = { Text("Monthly Plan Renewal Day", color = TextPrimary, fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    Text(
                        "Enter the day of the month (1 to 31) when your mobile bundle or billing cycle renews. This recalculates your 'This Cycle' and 'Last Cycle' usage.",
                        color = TextSecondary,
                        fontSize = 13.sp
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    OutlinedTextField(
                        value = cycleDayDraft,
                        onValueChange = { input ->
                            if (input.isEmpty() || input.all { it.isDigit() }) {
                                cycleDayDraft = input
                            }
                        },
                        label = { Text("Renewal Day (1–31)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = AccentPrimary,
                            unfocusedBorderColor = DarkBorder,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val parsed = cycleDayDraft.toIntOrNull()?.coerceIn(1, 31) ?: 1
                        val updated = settings.copy(cycleStartDay = parsed)
                        settingsRepo.updateSettings(updated)
                        settings = updated
                        showCycleDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = AccentPrimary)
                ) {
                    Text("Save", color = TextPrimary)
                }
            },
            dismissButton = {
                TextButton(onClick = { showCycleDialog = false }) {
                    Text("Cancel", color = TextMuted)
                }
            },
            containerColor = DarkSurface
        )
    }

    // Limit Dialog
    if (showLimitDialogFor != null) {
        val isMobile = showLimitDialogFor == "MOBILE"
        val networkTitle = if (isMobile) "Mobile Data Limit" else "Wi-Fi Data Limit"
        AlertDialog(
            onDismissRequest = { showLimitDialogFor = null },
            title = { Text(networkTitle, color = TextPrimary, fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    Text(
                        "Set a monthly data limit in GB and warning threshold. You will receive an alert notification when reaching the threshold.",
                        color = TextSecondary,
                        fontSize = 13.sp
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    OutlinedTextField(
                        value = limitGbDraft,
                        onValueChange = { limitGbDraft = it },
                        label = { Text("Limit in GB (e.g. 20, 50)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = AccentPrimary,
                            unfocusedBorderColor = DarkBorder,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = warnPctDraft,
                        onValueChange = { warnPctDraft = it },
                        label = { Text("Warning Threshold % (e.g. 80)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = AccentPrimary,
                            unfocusedBorderColor = DarkBorder,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val gb = limitGbDraft.toDoubleOrNull()
                        val bytes = if (gb != null && gb > 0) (gb * GB_BYTES).toLong() else null
                        val pct = warnPctDraft.toIntOrNull()?.coerceIn(1, 100) ?: 80

                        val updated = if (isMobile) {
                            settings.copy(mobileLimitBytes = bytes, mobileWarnAtPercent = pct)
                        } else {
                            settings.copy(wifiLimitBytes = bytes, wifiWarnAtPercent = pct)
                        }
                        settingsRepo.updateSettings(updated)
                        settings = updated
                        showLimitDialogFor = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = AccentPrimary)
                ) {
                    Text("Save", color = TextPrimary)
                }
            },
            dismissButton = {
                Row {
                    val hasExistingLimit = if (isMobile) settings.mobileLimitBytes != null else settings.wifiLimitBytes != null
                    if (hasExistingLimit) {
                        TextButton(
                            onClick = {
                                val updated = if (isMobile) {
                                    settings.copy(mobileLimitBytes = null)
                                } else {
                                    settings.copy(wifiLimitBytes = null)
                                }
                                settingsRepo.updateSettings(updated)
                                settings = updated
                                showLimitDialogFor = null
                            }
                        ) {
                            Text("Remove Limit", color = AccentSecondary)
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                    }
                    TextButton(onClick = { showLimitDialogFor = null }) {
                        Text("Cancel", color = TextMuted)
                    }
                }
            },
            containerColor = DarkSurface
        )
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
                    text = "Tracking preferences, cycle & limits",
                    color = TextSecondary,
                    fontSize = 14.sp
                )
            }

            // 1. Monthly Plan Renewal Day Card
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
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.CalendarMonth, contentDescription = null, tint = AccentPrimary, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Monthly Plan Renewal Day",
                                color = TextPrimary,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Renews on day ${settings.cycleStartDay} of each month. Drives 'This Cycle' date ranges.",
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Button(
                        onClick = {
                            cycleDayDraft = settings.cycleStartDay.toString()
                            showCycleDialog = true
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceVariant),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("Day ${settings.cycleStartDay}", color = AccentPrimary, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }
                }
            }

            // 2. Data Limits Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface)
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Text(
                        text = "Data Limits & Alerts",
                        color = TextPrimary,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Get notified before exceeding your monthly package quota.",
                        color = TextMuted,
                        fontSize = 12.sp
                    )
                    Spacer(modifier = Modifier.height(14.dp))

                    // Mobile Limit Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.PhoneAndroid, contentDescription = null, tint = AccentPrimary, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Mobile Limit", color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            }
                            val mobileText = if (settings.mobileLimitBytes != null) {
                                "%.1f GB (Warn at %d%%)".format(settings.mobileLimitBytes!! / (1024.0 * 1024.0 * 1024.0), settings.mobileWarnAtPercent)
                            } else {
                                "No limit set"
                            }
                            Text(mobileText, color = TextMuted, fontSize = 12.sp)
                        }
                        Button(
                            onClick = {
                                limitGbDraft = if (settings.mobileLimitBytes != null) "%.1f".format(settings.mobileLimitBytes!! / (1024.0 * 1024.0 * 1024.0)) else ""
                                warnPctDraft = settings.mobileWarnAtPercent.toString()
                                showLimitDialogFor = "MOBILE"
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceVariant),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(if (settings.mobileLimitBytes != null) "Edit" else "Set Limit", color = AccentPrimary, fontSize = 12.sp)
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    HorizontalDivider(color = DarkBorder, thickness = 0.5.dp)
                    Spacer(modifier = Modifier.height(12.dp))

                    // Wi-Fi Limit Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Wifi, contentDescription = null, tint = AccentPrimary, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Wi-Fi Limit", color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            }
                            val wifiText = if (settings.wifiLimitBytes != null) {
                                "%.1f GB (Warn at %d%%)".format(settings.wifiLimitBytes!! / (1024.0 * 1024.0 * 1024.0), settings.wifiWarnAtPercent)
                            } else {
                                "No limit set"
                            }
                            Text(wifiText, color = TextMuted, fontSize = 12.sp)
                        }
                        Button(
                            onClick = {
                                limitGbDraft = if (settings.wifiLimitBytes != null) "%.1f".format(settings.wifiLimitBytes!! / (1024.0 * 1024.0 * 1024.0)) else ""
                                warnPctDraft = settings.wifiWarnAtPercent.toString()
                                showLimitDialogFor = "WIFI"
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceVariant),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(if (settings.wifiLimitBytes != null) "Edit" else "Set Limit", color = AccentPrimary, fontSize = 12.sp)
                        }
                    }
                }
            }

            // 3. System Apps Toggle Card
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
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Layers, contentDescription = null, tint = AccentPrimary, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Show System Apps",
                                color = TextPrimary,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Include low-level Android OS services and root processes in usage lists",
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                    }
                    Switch(
                        checked = settings.showSystemApps,
                        onCheckedChange = { checked ->
                            val updated = settings.copy(showSystemApps = checked)
                            settingsRepo.updateSettings(updated)
                            settings = updated
                        },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = TextPrimary,
                            checkedTrackColor = AccentPrimary,
                            uncheckedThumbColor = TextMuted,
                            uncheckedTrackColor = DarkSurfaceVariant
                        )
                    )
                }
            }

            // 4. Wi-Fi Tracking Card
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
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.WifiTethering, contentDescription = null, tint = AccentPrimary, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Wi-Fi Network Attribution",
                                    color = TextPrimary,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Attribute Wi-Fi data usage by SSID network name (Home, Work, etc.)",
                                color = TextMuted,
                                fontSize = 12.sp
                            )
                        }
                        Switch(
                            checked = wifiWatchEnabled,
                            onCheckedChange = { enabled ->
                                WifiSessions.setEnabled(context, enabled)
                                wifiWatchEnabled = enabled
                                if (enabled) {
                                    WifiWatchService.start(context)
                                } else {
                                    WifiWatchService.stop(context)
                                }
                                wifiProblem = WifiWatchService.problem(context)
                            },
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = TextPrimary,
                                checkedTrackColor = AccentPrimary,
                                uncheckedThumbColor = TextMuted,
                                uncheckedTrackColor = DarkSurfaceVariant
                            )
                        )
                    }

                    if (wifiProblem != null) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = AccentSecondary.copy(alpha = 0.12f)
                        ) {
                            Text(
                                text = "Permission needed: ${wifiProblem}",
                                color = AccentSecondary,
                                fontSize = 12.sp,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                            )
                        }
                    }
                }
            }

            // 5. Automatic Updates & Background Keep-Alive
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
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Schedule, contentDescription = null, tint = AccentPrimary, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Regular Background Sync",
                                    color = TextPrimary,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Keep usage tracking fresh and accurate even when the app is closed.",
                                color = TextMuted,
                                fontSize = 12.sp
                            )
                        }
                        Switch(
                            checked = keepAliveEnabled,
                            onCheckedChange = { enabled ->
                                SyncKeepAlive.setEnabled(context, enabled)
                                keepAliveEnabled = enabled
                            },
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = TextPrimary,
                                checkedTrackColor = AccentPrimary,
                                uncheckedThumbColor = TextMuted,
                                uncheckedTrackColor = DarkSurfaceVariant
                            )
                        )
                    }

                    if (!isIgnoringBattery) {
                        Spacer(modifier = Modifier.height(12.dp))
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

            // 6. Family Sharing & Pairing
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
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Group, contentDescription = null, tint = AccentPrimary, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Family Sharing & Pairing",
                                color = TextPrimary,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        val status = when (settings.familyRole) {
                            "parent" -> "Role: Parent (Active sync)"
                            "child" -> "Role: Child (Linked to parent)"
                            else -> "Not paired yet"
                        }
                        Text(
                            text = status,
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

            // 7. Export Data Card
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

            // 8. App Updates Card
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
                            text = "Software Updates",
                            color = TextPrimary,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = "Check GitHub for new versions & release notes",
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                    }
                    Button(
                        onClick = onNavigateToUpdate,
                        colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceVariant),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.SystemUpdate,
                            contentDescription = null,
                            tint = AccentPrimary,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Check", color = AccentPrimary, fontSize = 13.sp)
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
