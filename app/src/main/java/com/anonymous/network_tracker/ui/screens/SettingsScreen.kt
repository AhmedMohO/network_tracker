package com.anonymous.network_tracker.ui.screens

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import android.widget.Toast
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.anonymous.network_tracker.data.repository.AppSettings
import com.anonymous.network_tracker.data.repository.SettingsRepository
import com.anonymous.network_tracker.data.repository.UsageRepository
import com.anonymous.network_tracker.data.util.RangeUtils
import com.anonymous.network_tracker.data.util.UsageExport
import com.anonymous.network_tracker.data.util.parseLimitGb
import com.anonymous.network_tracker.service.SyncKeepAlive
import com.anonymous.network_tracker.service.WifiSessions
import com.anonymous.network_tracker.service.WifiWatchService
import com.anonymous.network_tracker.ui.LaunchedOnResumeEffect
import com.anonymous.network_tracker.ui.UsageState
import com.anonymous.network_tracker.ui.rememberUsageState
import com.anonymous.network_tracker.ui.theme.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

@Composable
fun SettingsScreen(
    onNavigateToFamily: () -> Unit,
    onNavigateToUpdate: () -> Unit,
    modifier: Modifier = Modifier,
    usageState: UsageState = rememberUsageState(),
    onAppearanceChanged: () -> Unit = {},
    onDiagnosticsToggled: () -> Unit = {}
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
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                errorMessage = e.message ?: "Export failed. Try again."
            } finally {
                isExporting = false
            }
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
                        if (parsed == null || parsed !in 1..31) {
                            errorMessage = "Enter a renewal day from 1 to 31."
                        } else if (save { it.copy(cycleStartDay = parsed) }) {
                            showCycleDialog = false
                        }
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
        val networkTitle = if (isMobile) "Mobile Limit" else "Wi-Fi Limit"
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
                        } else if (save {
                            if (isMobile) it.copy(mobileLimitBytes = bytes, mobileWarnAtPercent = pct)
                            else it.copy(wifiLimitBytes = bytes, wifiWarnAtPercent = pct)
                        }) {
                            showLimitDialogFor = null
                        }
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
                                if (save { if (isMobile) it.copy(mobileLimitBytes = null) else it.copy(wifiLimitBytes = null) }) {
                                    showLimitDialogFor = null
                                }
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
                .padding(horizontal = 16.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Header
            Column {
                Text(
                    text = tr("Settings"),
                    color = TextPrimary,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = tr("Tracking preferences, cycle & limits"),
                    color = TextSecondary,
                    fontSize = 13.sp
                )
            }

            if (errorMessage != null) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = DarkSurface),
                    border = BorderStroke(1.dp, DangerRed.copy(alpha = 0.5f))
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(tr(errorMessage!!), color = DangerRed, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                        TextButton(onClick = { errorMessage = null }) { Text(tr("Dismiss"), color = TextMuted) }
                    }
                }
            }

            // 1. PREFERENCES GROUP
            SettingSectionHeader("PREFERENCES")
            SettingGroupCard {
                // Language
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    SettingLeadingIcon(Icons.Default.Language)
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(tr("Language"), color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                        Text(if (settings.language == "ar") "العربية" else "English", color = TextMuted, fontSize = 12.sp)
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("en" to "English", "ar" to "العربية").forEach { (code, label) ->
                            FilterChip(
                                selected = settings.language == code,
                                onClick = {
                                    if (save { it.copy(language = code) }) onAppearanceChanged()
                                },
                                label = { Text(label, fontSize = 12.sp) }
                            )
                        }
                    }
                }

                SettingDivider()

                // Appearance
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    SettingLeadingIcon(Icons.Default.DarkMode)
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(tr("Appearance"), color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                        Text(tr(when (settings.themeMode) { "light" -> "Light"; "dark" -> "Dark"; else -> "System" }), color = TextMuted, fontSize = 12.sp)
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("system" to "System", "light" to "Light", "dark" to "Dark").forEach { (mode, label) ->
                            FilterChip(
                                selected = settings.themeMode == mode,
                                onClick = {
                                    if (save { it.copy(themeMode = mode) }) onAppearanceChanged()
                                },
                                label = { Text(tr(label), fontSize = 12.sp) }
                            )
                        }
                    }
                }

                SettingDivider()

                // System Notification Settings
                SettingActionItem(
                    icon = Icons.Default.Notifications,
                    title = "System Notification Settings",
                    subtitle = "Configure alert sounds, badges and priority",
                    onClick = {
                        context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
                    }
                ) {
                    Icon(Icons.Default.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(18.dp))
                }
            }

            // 2. BILLING & DATA LIMITS GROUP
            SettingSectionHeader("BILLING & CYCLES")
            SettingGroupCard {
                // Monthly Plan Renewal Day
                SettingActionItem(
                    icon = Icons.Default.CalendarMonth,
                    title = "Monthly Plan Renewal Day",
                    subtitle = "Renews on day %d of each month. Drives 'This Cycle' date ranges.",
                    subtitleArgs = arrayOf(settings.cycleStartDay),
                    onClick = {
                        cycleDayDraft = settings.cycleStartDay.toString()
                        showCycleDialog = true
                    }
                ) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(DarkSurfaceVariant)
                            .padding(horizontal = 10.dp, vertical = 6.dp)
                    ) {
                        Text(
                            text = tr("Day %d", settings.cycleStartDay),
                            color = AccentPrimary,
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp
                        )
                    }
                }

                SettingDivider()

                // Mobile Data Limit
                SettingActionItem(
                    icon = Icons.Default.PhoneAndroid,
                    title = "Mobile Limit",
                    subtitle = if (settings.mobileLimitBytes != null) "%.1f GB (Warn at %d%%)" else "No limit set",
                    subtitleArgs = if (settings.mobileLimitBytes != null) arrayOf<Any>(settings.mobileLimitBytes!! / (1024.0 * 1024.0 * 1024.0), settings.mobileWarnAtPercent) else emptyArray(),
                    onClick = {
                        limitGbDraft = if (settings.mobileLimitBytes != null) "%.1f".format(settings.mobileLimitBytes!! / (1024.0 * 1024.0 * 1024.0)) else ""
                        warnPctDraft = settings.mobileWarnAtPercent.toString()
                        showLimitDialogFor = "MOBILE"
                    }
                ) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(DarkSurfaceVariant)
                            .padding(horizontal = 10.dp, vertical = 6.dp)
                    ) {
                        Text(
                            text = if (settings.mobileLimitBytes != null) tr("Edit") else tr("Set Limit"),
                            color = AccentPrimary,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 12.sp
                        )
                    }
                }

                SettingDivider()

                // Wi-Fi Data Limit
                SettingActionItem(
                    icon = Icons.Default.Wifi,
                    title = "Wi-Fi Limit",
                    subtitle = if (settings.wifiLimitBytes != null) "%.1f GB (Warn at %d%%)" else "No limit set",
                    subtitleArgs = if (settings.wifiLimitBytes != null) arrayOf<Any>(settings.wifiLimitBytes!! / (1024.0 * 1024.0 * 1024.0), settings.wifiWarnAtPercent) else emptyArray(),
                    onClick = {
                        limitGbDraft = if (settings.wifiLimitBytes != null) "%.1f".format(settings.wifiLimitBytes!! / (1024.0 * 1024.0 * 1024.0)) else ""
                        warnPctDraft = settings.wifiWarnAtPercent.toString()
                        showLimitDialogFor = "WIFI"
                    }
                ) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(DarkSurfaceVariant)
                            .padding(horizontal = 10.dp, vertical = 6.dp)
                    ) {
                        Text(
                            text = if (settings.wifiLimitBytes != null) tr("Edit") else tr("Set Limit"),
                            color = AccentPrimary,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 12.sp
                        )
                    }
                }
            }

            // 3. DATA ATTRIBUTION GROUP
            SettingSectionHeader("DATA ATTRIBUTION")
            SettingGroupCard {
                // Show System Apps Toggle
                SettingToggleItem(
                    icon = Icons.Default.Layers,
                    title = "Show System Apps",
                    subtitle = "Include low-level Android OS services and root processes in usage lists",
                    checked = settings.showSystemApps,
                    onCheckedChange = { checked -> save { it.copy(showSystemApps = checked) } }
                )

                SettingDivider()

                // Wi-Fi Network Attribution Toggle
                Column {
                    SettingToggleItem(
                        icon = Icons.Default.WifiTethering,
                        title = "Wi-Fi Network Attribution",
                        subtitle = "Attribute Wi-Fi data usage by SSID network name (Home, Work, etc.)",
                        checked = wifiWatchEnabled,
                        onCheckedChange = { enabled ->
                            if (enabled && ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                                locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                            } else setWifiWatch(enabled)
                        }
                    )

                    if (wifiProblem != null) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 8.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(DarkSurfaceVariant)
                                .padding(12.dp)
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(
                                    tr(when (wifiProblem) {
                                        "permission" -> "Location access is needed to identify Wi-Fi networks."
                                        "background" -> "Allow location all the time for background Wi-Fi tracking."
                                        else -> "Turn on device location to identify Wi-Fi networks."
                                    }),
                                    color = TextSecondary,
                                    fontSize = 12.sp
                                )
                                TextButton(
                                    onClick = { WifiWatchService.openFix(context) },
                                    modifier = Modifier.align(Alignment.End)
                                ) {
                                    Text(tr("Open location settings"), color = AccentPrimary, fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }
            }

            // 4. BACKGROUND SYNC GROUP
            SettingSectionHeader("BACKGROUND SYNC")
            SettingGroupCard {
                SettingToggleItem(
                    icon = Icons.Default.Schedule,
                    title = "Regular Background Sync",
                    subtitle = "Keep usage tracking fresh and accurate even when the app is closed.",
                    checked = keepAliveEnabled,
                    onCheckedChange = { enabled ->
                        SyncKeepAlive.setEnabled(context, enabled)
                        keepAliveEnabled = enabled
                    }
                )

                if (!isIgnoringBattery) {
                    SettingDivider()
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(tr("Exempt from Battery Optimization"), color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                            Text(tr("Your phone may pause the app to save battery, which can delay updates."), color = TextMuted, fontSize = 11.sp)
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Button(
                            onClick = {
                                SyncKeepAlive.requestIgnoreBatteryOptimizations(context)
                                isIgnoringBattery = SyncKeepAlive.isIgnoringBatteryOptimizations(context)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceVariant),
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                        ) {
                            Text(tr("Exempt from Battery Optimization"), color = AccentSecondary, fontSize = 11.sp)
                        }
                    }
                }
            }

            // 5. FAMILY GROUP
            SettingSectionHeader("FAMILY & SYNC")
            SettingGroupCard {
                val statusText = when (settings.familyRole) {
                    "parent" -> "Role: Parent (Active sync)"
                    "child" -> "Role: Child (Linked to parent)"
                    else -> "Not paired yet"
                }
                SettingActionItem(
                    icon = Icons.Default.Group,
                    title = "Family Sharing & Pairing",
                    subtitle = statusText,
                    onClick = onNavigateToFamily
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(tr("Open Family"), color = AccentPrimary, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = AccentPrimary, modifier = Modifier.size(16.dp))
                    }
                }
            }

            // 6. DATA MANAGEMENT & EXPORT GROUP
            SettingSectionHeader("DATA EXPORT")
            SettingGroupCard {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        SettingLeadingIcon(Icons.Default.Share)
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(tr("Data Management"), color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                            Text(tr("Export the selected date range and network as CSV or JSON."), color = TextMuted, fontSize = 12.sp)
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Button(
                            enabled = !isExporting,
                            onClick = { export("csv") },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceVariant),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.Default.Share, contentDescription = null, tint = AccentSecondary, modifier = Modifier.size(15.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(tr("Export CSV"), color = AccentSecondary, fontSize = 12.sp)
                        }

                        Button(
                            enabled = !isExporting,
                            onClick = { export("json") },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceVariant),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.Default.Share, contentDescription = null, tint = AccentSecondary, modifier = Modifier.size(15.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(tr("Export JSON"), color = AccentSecondary, fontSize = 12.sp)
                        }
                    }
                }
            }

            // 7. SOFTWARE UPDATES GROUP
            SettingSectionHeader("SYSTEM")
            SettingGroupCard {
                SettingActionItem(
                    icon = Icons.Default.SystemUpdate,
                    title = "Software Updates",
                    subtitle = "Check GitHub for new versions & release notes",
                    onClick = onNavigateToUpdate
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(tr("Check"), color = AccentPrimary, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = AccentPrimary, modifier = Modifier.size(16.dp))
                    }
                }
            }

            // Version info footer (tap 7 times to toggle developer Diagnostics tab)
            var devTapCount by remember { mutableIntStateOf(0) }
            var lastDevTapMs by remember { mutableLongStateOf(0L) }
            val devPrefs = remember { context.getSharedPreferences("dev_mode", 0) }
            val devModeEnabledMsg = tr("Developer options: Diagnostics tab enabled")
            val devModeDisabledMsg = tr("Developer options: Diagnostics tab disabled")

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 12.dp)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null
                    ) {
                        val now = System.currentTimeMillis()
                        if (now - lastDevTapMs > 1500L) {
                            devTapCount = 1
                        } else {
                            devTapCount++
                        }
                        lastDevTapMs = now

                        if (devTapCount >= 7) {
                            devTapCount = 0
                            val updated = !devPrefs.getBoolean("diagnostics_enabled", false)
                            devPrefs.edit().putBoolean("diagnostics_enabled", updated).apply()
                            val msg = if (updated) devModeEnabledMsg else devModeDisabledMsg
                            Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                            onDiagnosticsToggled()
                        }
                    },
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = tr("NetTrack v2.0.0 (Native Kotlin)"),
                    color = TextMuted,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

// -------------------------------------------------------------------------------------------------
// REUSABLE SETTING COMPONENTS
// -------------------------------------------------------------------------------------------------

@Composable
private fun SettingSectionHeader(title: String) {
    Text(
        text = tr(title),
        color = TextMuted,
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.5.sp,
        modifier = Modifier.padding(start = 4.dp, top = 6.dp, bottom = 2.dp)
    )
}

@Composable
private fun SettingGroupCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = DarkSurface),
        border = BorderStroke(1.dp, DarkBorder),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        content = content
    )
}

@Composable
private fun SettingLeadingIcon(icon: ImageVector) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(DarkSurfaceVariant),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = AccentPrimary,
            modifier = Modifier.size(18.dp)
        )
    }
}

@Composable
private fun SettingDivider() {
    HorizontalDivider(
        color = DarkBorder.copy(alpha = 0.6f),
        thickness = 0.5.dp
    )
}

@Composable
private fun SettingToggleItem(
    icon: ImageVector,
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    val switchLabel = tr(title)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable { onCheckedChange(!checked) }
            .padding(horizontal = 16.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        SettingLeadingIcon(icon)
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = tr(title),
                color = TextPrimary,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = tr(subtitle),
                color = TextMuted,
                fontSize = 12.sp,
                lineHeight = 16.sp
            )
        }
        Spacer(modifier = Modifier.width(16.dp))
        Switch(
            modifier = Modifier.semantics { contentDescription = switchLabel },
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = TextPrimary,
                checkedTrackColor = AccentPrimary,
                uncheckedThumbColor = TextMuted,
                uncheckedTrackColor = DarkSurfaceVariant
            )
        )
    }
}

@Composable
private fun SettingActionItem(
    icon: ImageVector,
    title: String,
    subtitle: String,
    subtitleArgs: Array<out Any> = emptyArray(),
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    trailing: @Composable () -> Unit
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        SettingLeadingIcon(icon)
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = tr(title),
                color = TextPrimary,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = if (subtitleArgs.isEmpty()) tr(subtitle) else tr(subtitle, *subtitleArgs),
                color = TextMuted,
                fontSize = 12.sp,
                lineHeight = 16.sp
            )
        }
        Spacer(modifier = Modifier.width(12.dp))
        trailing()
    }
}
