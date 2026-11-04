package com.anonymous.network_tracker.ui.screens

import android.app.DatePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anonymous.network_tracker.core.UsageAccess
import com.anonymous.network_tracker.data.model.AppUsageItem
import com.anonymous.network_tracker.data.model.WifiNetworkSlice
import com.anonymous.network_tracker.data.repository.SettingsRepository
import com.anonymous.network_tracker.data.repository.UsageRepository
import com.anonymous.network_tracker.data.util.DateRange
import com.anonymous.network_tracker.data.util.PresetId
import com.anonymous.network_tracker.data.util.RangeUtils
import com.anonymous.network_tracker.ui.components.AppIconImage
import com.anonymous.network_tracker.ui.theme.*
import kotlinx.coroutines.launch
import java.util.Calendar

@Composable
fun OverviewScreen(
    onNavigateToAppDetail: (uid: Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val repo = remember(context) { UsageRepository.getInstance(context) }
    val settingsRepo = remember(context) { SettingsRepository.getInstance(context) }
    val scope = rememberCoroutineScope()

    var settings by remember { mutableStateOf(settingsRepo.loadSettings()) }

    // React Native defaults to "MOBILE" because that is the network that costs money
    var selectedPreset by remember { mutableStateOf(PresetId.TODAY) }
    var selectedNetwork by remember { mutableStateOf("MOBILE") } // "MOBILE", "WIFI", "ALL"

    var customRange by remember { mutableStateOf<DateRange?>(null) }
    var appList by remember { mutableStateOf<List<AppUsageItem>>(emptyList()) }
    var wifiSlices by remember { mutableStateOf<List<WifiNetworkSlice>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var hasPermission by remember { mutableStateOf(UsageAccess.has(context)) }

    // Re-read settings whenever screen enters foreground/mounts
    LaunchedEffect(Unit) {
        settings = settingsRepo.loadSettings()
    }

    val activeRange = remember(selectedPreset, customRange, settings.cycleStartDay) {
        if (selectedPreset == PresetId.CUSTOM && customRange != null) {
            customRange!!
        } else {
            RangeUtils.presetRange(selectedPreset, cycleStartDay = settings.cycleStartDay)
        }
    }

    fun loadData() {
        if (!hasPermission) return
        isLoading = true
        scope.launch {
            try {
                appList = repo.getUsage(activeRange, selectedNetwork)
                if (selectedNetwork == "WIFI" || selectedNetwork == "ALL") {
                    wifiSlices = repo.getUsageByWifiNetwork(activeRange)
                } else {
                    wifiSlices = emptyList()
                }
            } catch (_: Exception) {
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(activeRange, selectedNetwork, hasPermission) {
        loadData()
    }

    fun showCustomDatePicker() {
        val cal = Calendar.getInstance()
        val endYear = cal.get(Calendar.YEAR)
        val endMonth = cal.get(Calendar.MONTH)
        val endDay = cal.get(Calendar.DAY_OF_MONTH)

        DatePickerDialog(context, { _, year, month, dayOfMonth ->
            val startCal = Calendar.getInstance().apply {
                set(year, month, dayOfMonth, 0, 0, 0)
                set(Calendar.MILLISECOND, 0)
            }
            customRange = DateRange(startCal.timeInMillis, System.currentTimeMillis(), PresetId.CUSTOM)
            selectedPreset = PresetId.CUSTOM
        }, endYear, endMonth, endDay).show()
    }

    // Partition apps: hide low-level system apps (< 10000, except Tethering -5) if showSystemApps is false
    val (visibleApps, hiddenApps) = remember(appList, settings.showSystemApps) {
        if (settings.showSystemApps) {
            appList to emptyList()
        } else {
            appList.partition { it.uid >= 10000 || it.uid == -5 }
        }
    }

    val totalRx = appList.sumOf { it.download }
    val totalTx = appList.sumOf { it.upload }
    val totalBytes = totalRx + totalTx

    val activeLimitBytes = if (selectedNetwork == "MOBILE") settings.mobileLimitBytes else if (selectedNetwork == "WIFI") settings.wifiLimitBytes else null
    val warnPercent = if (selectedNetwork == "MOBILE") settings.mobileWarnAtPercent else settings.wifiWarnAtPercent

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = DarkBackground
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Header bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "NetTrack",
                        color = TextPrimary,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Cycle renewal: Day ${settings.cycleStartDay}",
                        color = TextMuted,
                        fontSize = 12.sp
                    )
                }

                IconButton(
                    onClick = { loadData() },
                    modifier = Modifier
                        .size(38.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(DarkSurface)
                ) {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = "Refresh",
                        tint = AccentPrimary,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            if (!hasPermission) {
                PermissionBanner {
                    UsageAccess.open(context)
                }
            }

            // Network filter tabs (Mobile / Wi-Fi / All Traffic)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(DarkSurface)
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                NetworkFilterTab(
                    icon = Icons.Default.PhoneAndroid,
                    label = "Mobile",
                    isSelected = selectedNetwork == "MOBILE",
                    onClick = { selectedNetwork = "MOBILE" },
                    modifier = Modifier.weight(1f)
                )
                NetworkFilterTab(
                    icon = Icons.Default.Wifi,
                    label = "Wi-Fi",
                    isSelected = selectedNetwork == "WIFI",
                    onClick = { selectedNetwork = "WIFI" },
                    modifier = Modifier.weight(1f)
                )
                NetworkFilterTab(
                    icon = Icons.Default.Language,
                    label = "All Traffic",
                    isSelected = selectedNetwork == "ALL",
                    onClick = { selectedNetwork = "ALL" },
                    modifier = Modifier.weight(1f)
                )
            }

            // Interval chip selector (Today, Yesterday, 24h, 7d, 30d, This Cycle, Last Cycle, Custom)
            LazyRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val presets = listOf(
                    PresetId.TODAY to "Today",
                    PresetId.YESTERDAY to "Yesterday",
                    PresetId.LAST_24H to "24 Hours",
                    PresetId.LAST_7D to "7 Days",
                    PresetId.LAST_30D to "30 Days",
                    PresetId.THIS_CYCLE to "This Cycle (Day ${settings.cycleStartDay})",
                    PresetId.LAST_CYCLE to "Last Cycle",
                    PresetId.CUSTOM to "Custom Date…"
                )
                items(presets) { (preset, label) ->
                    val isSelected = selectedPreset == preset
                    FilterChip(
                        selected = isSelected,
                        onClick = {
                            if (preset == PresetId.CUSTOM) {
                                showCustomDatePicker()
                            } else {
                                selectedPreset = preset
                            }
                        },
                        label = { Text(label, fontSize = 12.sp) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = AccentPrimary,
                            selectedLabelColor = TextPrimary,
                            containerColor = DarkSurface,
                            labelColor = TextSecondary
                        ),
                        border = FilterChipDefaults.filterChipBorder(
                            borderColor = if (isSelected) AccentPrimary else DarkBorder,
                            selectedBorderColor = AccentPrimary,
                            enabled = true,
                            selected = isSelected
                        )
                    )
                }
            }

            // Data Limit Card (if limit is configured for the active network)
            if (activeLimitBytes != null && activeLimitBytes > 0) {
                val usedPct = (totalBytes.toFloat() / activeLimitBytes.toFloat()).coerceIn(0f, 1f)
                val isWarning = usedPct >= (warnPercent / 100f)

                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = DarkSurface)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "${if (selectedNetwork == "MOBILE") "Mobile" else "Wi-Fi"} Data Limit",
                                color = if (isWarning) AccentSecondary else TextPrimary,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "%.1f%% used".format(usedPct * 100),
                                color = if (isWarning) AccentSecondary else AccentPrimary,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        LinearProgressIndicator(
                            progress = { usedPct },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp)),
                            color = if (isWarning) AccentSecondary else AccentPrimary,
                            trackColor = DarkSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "${repo.formatBytes(totalBytes)} of ${repo.formatBytes(activeLimitBytes)} limit",
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                    }
                }
            }

            // Totals Summary Card
            TotalsCard(
                totalFormatted = repo.formatBytes(totalBytes),
                rxFormatted = repo.formatBytes(totalRx),
                txFormatted = repo.formatBytes(totalTx),
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
            )

            // Wi-Fi Per-Network Card if Wi-Fi active and slices available
            if ((selectedNetwork == "WIFI" || selectedNetwork == "ALL") && wifiSlices.isNotEmpty()) {
                WifiSlicesCard(
                    slices = wifiSlices,
                    formatBytes = { repo.formatBytes(it) },
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                )
            }

            // Apps List Header with System Apps counter
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Applications (${visibleApps.size})",
                    color = TextSecondary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "Sorted by Usage",
                    color = TextMuted,
                    fontSize = 12.sp
                )
            }

            // Hidden System Apps Banner (if any system apps were hidden)
            if (hiddenApps.isNotEmpty() && !settings.showSystemApps) {
                val hiddenTotal = hiddenApps.sumOf { it.total }
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp)
                        .clickable {
                            val updated = settings.copy(showSystemApps = true)
                            settingsRepo.updateSettings(updated)
                            settings = updated
                        },
                    shape = RoundedCornerShape(8.dp),
                    color = DarkSurface
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "${hiddenApps.size} system apps hidden (${repo.formatBytes(hiddenTotal)})",
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                        Text(
                            text = "Show",
                            color = AccentPrimary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Apps List
            if (isLoading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = AccentPrimary)
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(visibleApps, key = { it.uid }) { item ->
                        AppUsageRow(
                            item = item,
                            formatBytes = { repo.formatBytes(it) },
                            onClick = { onNavigateToAppDetail(item.uid) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun NetworkFilterTab(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(20.dp))
            .clickable(onClick = onClick),
        color = if (isSelected) AccentPrimary else Color.Transparent,
        shape = RoundedCornerShape(20.dp)
    ) {
        Row(
            modifier = Modifier.padding(vertical = 8.dp, horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (isSelected) TextPrimary else TextMuted,
                modifier = Modifier.size(14.dp)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = label,
                color = if (isSelected) TextPrimary else TextSecondary,
                fontSize = 12.sp,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                maxLines = 1
            )
        }
    }
}

@Composable
fun PermissionBanner(onGrantClick: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        shape = RoundedCornerShape(12.dp),
        color = AccentSecondary.copy(alpha = 0.15f)
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Usage Access Required",
                    color = AccentSecondary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Permission is needed to query per-app network consumption from Android.",
                    color = TextSecondary,
                    fontSize = 12.sp
                )
            }
            Spacer(modifier = Modifier.width(10.dp))
            Button(
                onClick = onGrantClick,
                colors = ButtonDefaults.buttonColors(containerColor = AccentSecondary),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text("Grant", color = TextPrimary, fontSize = 12.sp)
            }
        }
    }
}

@Composable
fun TotalsCard(
    totalFormatted: String,
    rxFormatted: String,
    txFormatted: String,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = DarkSurface)
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            Text(
                text = "Total Consumption",
                color = TextSecondary,
                fontSize = 12.sp
            )
            Text(
                text = totalFormatted,
                color = TextPrimary,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(14.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.ArrowDownward,
                        contentDescription = "Download",
                        tint = AccentPrimary,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Download: $rxFormatted", color = TextSecondary, fontSize = 13.sp)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.ArrowUpward,
                        contentDescription = "Upload",
                        tint = AccentSecondary,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Upload: $txFormatted", color = TextSecondary, fontSize = 13.sp)
                }
            }
        }
    }
}

@Composable
fun WifiSlicesCard(
    slices: List<WifiNetworkSlice>,
    formatBytes: (Long) -> String,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = DarkSurface)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.Wifi,
                    contentDescription = null,
                    tint = AccentPrimary,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Wi-Fi Networks Breakdown",
                    color = TextPrimary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            val grandSliceTotal = slices.sumOf { it.totals.total }.coerceAtLeast(1L)
            slices.forEach { slice ->
                val sliceName = if (slice.ssid.isNullOrEmpty()) "Other networks" else slice.ssid
                val sliceTotal = slice.totals.total
                val slicePercent = (sliceTotal.toDouble() / grandSliceTotal.toDouble()) * 100.0
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = sliceName,
                        color = TextSecondary,
                        fontSize = 13.sp
                    )
                    Text(
                        text = "${formatBytes(sliceTotal)} (${"%.1f".format(slicePercent)}%)",
                        color = TextPrimary,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

@Composable
fun AppUsageRow(
    item: AppUsageItem,
    formatBytes: (Long) -> String,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = DarkSurface)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AppIconImage(
                packageName = item.packageName,
                appName = item.name,
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(DarkSurfaceVariant)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.name,
                    color = TextPrimary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "Down: ${formatBytes(item.download)} • Up: ${formatBytes(item.upload)}",
                    color = TextMuted,
                    fontSize = 12.sp
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = formatBytes(item.total),
                    color = TextPrimary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "%.1f%%".format(item.percentage),
                    color = AccentPrimary,
                    fontSize = 12.sp
                )
            }
        }
    }
}
