package com.anonymous.network_tracker.ui.screens

import android.Manifest
import android.os.Build
import android.provider.Settings
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.anonymous.network_tracker.ui.UsageState
import com.anonymous.network_tracker.ui.rememberUsageState
import com.anonymous.network_tracker.ui.LaunchedOnResumeEffect
import com.anonymous.network_tracker.data.util.UsageExport
import com.anonymous.network_tracker.data.util.parseLimitGb
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
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
    modifier: Modifier = Modifier,
    usageState: UsageState = rememberUsageState(),
    onAppearanceChanged: () -> Unit = {}
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

    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isExporting by remember { mutableStateOf(false) }
    LaunchedOnResumeEffect(context) {
            settings = settingsRepo.loadSettings()
            wifiWatchEnabled = WifiSessions.isEnabled(context)
            keepAliveEnabled = SyncKeepAlive.isEnabled(context)
            wifiProblem = WifiWatchService.problem(context)
            isIgnoringBattery = SyncKeepAlive.isIgnoringBatteryOptimizations(context)
            }
    fun save(change: (AppSettings) -> AppSettings): Boolean = try {
        settings = settingsRepo.update(change)
        errorMessage = null
        true
    } catch (e: Exception) {
        errorMessage = e.message ?: "Unable to save settings. Try again."
        false
    }
    fun setWifiWatch(enabled: Boolean) {
        try {
            WifiSessions.setEnabled(context, enabled)
            WifiWatchService.sync(context)
            wifiWatchEnabled = enabled
            wifiProblem = WifiWatchService.problem(context)
        } catch (e: Exception) {
            errorMessage = e.message ?: "Unable to start tracking. Try again."
        }
    }
    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { permissions ->
        if (permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true) setWifiWatch(true)
        else errorMessage = "Location access is needed to identify Wi-Fi networks."
    }
    val exportTitle = tr("Export Usage")
    fun export(format: String) {
        val range = usageState.activeRange(settings.cycleStartDay)
        val network = usageState.selectedNetwork
        isExporting = true
        scope.launch {
            try {
                val apps = usageRepo.getUsage(range, network)
                val file = withContext(Dispatchers.IO) {
                    File(context.cacheDir, "network_usage_export.$format").apply {
                        writeText(if (format == "csv") UsageExport.toCsv(apps, range, network) else UsageExport.toJson(apps, range, network))
                    }
                }
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.apkprovider", file)
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = if (format == "csv") "text/csv" else "application/json"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                context.startActivity(Intent.createChooser(intent, exportTitle))
            } catch (e: kotlinx.coroutines.CancellationException) { throw e
            } catch (e: Exception) { errorMessage = e.message ?: "Export failed. Try again."
            } finally { isExporting = false }
        }
    }

    // Dialog state for Cycle Day
    var showCycleDialog by remember { mutableStateOf(false) }
    var cycleDayDraft by remember { mutableStateOf(settings.cycleStartDay.toString()) }

    // Dialog state for Data Limit
    var showLimitDialogFor by remember { mutableStateOf<String?>(null) } // "MOBILE" or "WIFI"
    var limitGbDraft by remember { mutableStateOf("") }
    var warnPctDraft by remember { mutableStateOf("80") }

    // Cycle Day Dialog
    if (showCycleDialog) {
        AlertDialog(
            onDismissRequest = { showCycleDialog = false },
            title = { Text(tr("Monthly Plan Renewal Day"), color = TextPrimary, fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    if (errorMessage != null) Text(tr(errorMessage!!), color = MaterialTheme.colorScheme.error)
                    Text(
                        tr("Enter the day of the month (1 to 31) when your mobile bundle or billing cycle renews. This recalculates your 'This Cycle' and 'Last Cycle' usage."),
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
                        label = { Text(tr("Renewal Day (1–31)")) },
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
                        val parsed = cycleDayDraft.toIntOrNull()
                        if (parsed == null || parsed !in 1..31) errorMessage = "Enter a renewal day from 1 to 31."
                        else if (save { it.copy(cycleStartDay = parsed) }) showCycleDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = AccentPrimary)
                ) {
                    Text(tr("Save"), color = MaterialTheme.colorScheme.onPrimary)
                }
            },
            dismissButton = {
                TextButton(onClick = { showCycleDialog = false }) {
                    Text(tr("Cancel"), color = TextMuted)
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
            title = { Text(tr(networkTitle), color = TextPrimary, fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    if (errorMessage != null) Text(tr(errorMessage!!), color = MaterialTheme.colorScheme.error)
                    Text(
                        tr("Set a monthly data limit in GB and warning threshold. You will receive an alert notification when reaching the threshold."),
                        color = TextSecondary,
                        fontSize = 13.sp
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    OutlinedTextField(
                        value = limitGbDraft,
                        onValueChange = { limitGbDraft = it },
                        label = { Text(tr("Limit in GB (e.g. 20, 50)")) },
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
                        label = { Text(tr("Warning Threshold % (e.g. 80)")) },
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
                        val bytes = parseLimitGb(limitGbDraft)
                        val pct = warnPctDraft.toIntOrNull()
                        if (bytes == null || pct == null || pct !in 1..100) {
                            errorMessage = "Enter a positive data limit and a warning percentage from 1 to 100."
                        } else if (save { if (isMobile) it.copy(mobileLimitBytes = bytes, mobileWarnAtPercent = pct)
                            else it.copy(wifiLimitBytes = bytes, wifiWarnAtPercent = pct) }) showLimitDialogFor = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = AccentPrimary)
                ) {
                    Text(tr("Save"), color = MaterialTheme.colorScheme.onPrimary)
                }
            },
            dismissButton = {
                Row {
                    val hasExistingLimit = if (isMobile) settings.mobileLimitBytes != null else settings.wifiLimitBytes != null
                    if (hasExistingLimit) {
                        TextButton(
                            onClick = {
                                if (save { if (isMobile) it.copy(mobileLimitBytes = null) else it.copy(wifiLimitBytes = null) }) showLimitDialogFor = null
                            }
                        ) {
                            Text(tr("Remove Limit"), color = AccentSecondary)
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                    }
                    TextButton(onClick = { showLimitDialogFor = null }) {
                        Text(tr("Cancel"), color = TextMuted)
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
                    text = tr("Settings"),
                    color = TextPrimary,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = tr("Tracking preferences, cycle & limits"),
                    color = TextSecondary,
                    fontSize = 14.sp
                )
            }

            if (errorMessage != null) {
                Text(tr(errorMessage!!), color = MaterialTheme.colorScheme.error)
                TextButton(onClick = { errorMessage = null }) { Text(tr("Dismiss")) }
            }
            Text(tr("Language"), style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("en" to "English", "ar" to "العربية").forEach { (code, label) ->
                    FilterChip(selected = settings.language == code, onClick = {
                        if (save { it.copy(language = code) }) onAppearanceChanged()
                    }, label = { Text(label) })
                }
            }
            Text(tr("Appearance"), style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("system" to "System", "light" to "Light", "dark" to "Dark").forEach { (mode, label) ->
                    FilterChip(selected = settings.themeMode == mode, onClick = {
                        if (save { it.copy(themeMode = mode) }) onAppearanceChanged()
                    }, label = { Text(tr(label)) })
                }
            }
            OutlinedButton(onClick = {
                context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
            }) { Text(tr("Notification settings")) }

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
                                text = tr("Monthly Plan Renewal Day"),
                                color = TextPrimary,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = tr("Renews on day %d of each month. Drives 'This Cycle' date ranges.", settings.cycleStartDay),
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
                        Text(tr("Day %d", settings.cycleStartDay), color = AccentPrimary, fontWeight = FontWeight.Bold, fontSize = 13.sp)
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
                        text = tr("Data Limits & Alerts"),
                        color = TextPrimary,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = tr("Get notified before exceeding your monthly package quota."),
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
                                Text(tr("Mobile Limit"), color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            }
                            val mobileText = if (settings.mobileLimitBytes != null) {
                                tr("%.1f GB (Warn at %d%%)", settings.mobileLimitBytes!! / (1024.0 * 1024.0 * 1024.0), settings.mobileWarnAtPercent)
                            } else {
                                tr("No limit set")
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
                            Text(if (settings.mobileLimitBytes != null) tr("Edit") else tr("Set Limit"), color = AccentPrimary, fontSize = 12.sp)
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
                                Text(tr("Wi-Fi Limit"), color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            }
                            val wifiText = if (settings.wifiLimitBytes != null) {
                                tr("%.1f GB (Warn at %d%%)", settings.wifiLimitBytes!! / (1024.0 * 1024.0 * 1024.0), settings.wifiWarnAtPercent)
                            } else {
                                tr("No limit set")
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
                            Text(if (settings.wifiLimitBytes != null) tr("Edit") else tr("Set Limit"), color = AccentPrimary, fontSize = 12.sp)
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
                                text = tr("Show System Apps"),
                                color = TextPrimary,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = tr("Include low-level Android OS services and root processes in usage lists"),
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                    }
                    val switchLabel = tr("Show System Apps")
                    Switch(
                        modifier = Modifier.semantics { contentDescription = switchLabel },
                        checked = settings.showSystemApps,
                        onCheckedChange = { checked ->
                            save { it.copy(showSystemApps = checked) }
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
                                    text = tr("Wi-Fi Network Attribution"),
                                    color = TextPrimary,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = tr("Attribute Wi-Fi data usage by SSID network name (Home, Work, etc.)"),
                                color = TextMuted,
                                fontSize = 12.sp
                            )
                        }
                        val switchLabel = tr("Wi-Fi Network Attribution")
                        Switch(
                            modifier = Modifier.semantics { contentDescription = switchLabel },
                            checked = wifiWatchEnabled,
                            onCheckedChange = { enabled ->
                                if (enabled && ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                                    locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                                } else setWifiWatch(enabled)
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
                        Text(tr(when (wifiProblem) {
                            "permission" -> "Location access is needed to identify Wi-Fi networks."
                            "background" -> "Allow location all the time for background Wi-Fi tracking."
                            else -> "Turn on device location to identify Wi-Fi networks."
                        }), color = TextSecondary)
                        TextButton(onClick = { WifiWatchService.openFix(context) }) { Text(tr("Open location settings")) }
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
                                    text = tr("Regular Background Sync"),
                                    color = TextPrimary,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = tr("Keep usage tracking fresh and accurate even when the app is closed."),
                                color = TextMuted,
                                fontSize = 12.sp
                            )
                        }
                        val switchLabel = tr("Regular Background Sync")
                        Switch(
                            modifier = Modifier.semantics { contentDescription = switchLabel },
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
                            Text(tr("Exempt from Battery Optimization"), color = AccentSecondary, fontSize = 12.sp)
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
                                text = tr("Family Sharing & Pairing"),
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
                            text = tr(status),
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                    }
                    Button(
                        onClick = onNavigateToFamily,
                        colors = ButtonDefaults.buttonColors(containerColor = AccentPrimary),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(tr("Open Family"), color = MaterialTheme.colorScheme.onPrimary, fontSize = 13.sp)
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
                        text = tr("Data Management"),
                        color = TextPrimary,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = tr("Export the selected date range and network as CSV or JSON."),
                        color = TextMuted,
                        fontSize = 12.sp
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        enabled = !isExporting,
                        onClick = { export("csv") },
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
                        Text(tr("Export CSV"), color = AccentSecondary, fontSize = 13.sp)
                    }
                }
            }

            OutlinedButton(enabled = !isExporting, onClick = { export("json") }) { Text(tr("Export JSON")) }

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
                            text = tr("Software Updates"),
                            color = TextPrimary,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = tr("Check GitHub for new versions & release notes"),
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
                        Text(tr("Check"), color = AccentPrimary, fontSize = 13.sp)
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
                    text = tr("NetTrack v2.0.0 (Native Kotlin)"),
                    color = TextMuted,
                    fontSize = 13.sp
                )
            }
        }
    }
}
