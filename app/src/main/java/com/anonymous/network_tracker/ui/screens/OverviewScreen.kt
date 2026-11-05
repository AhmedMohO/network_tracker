package com.anonymous.network_tracker.ui.screens

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import kotlinx.coroutines.CancellationException
import com.anonymous.network_tracker.ui.*
import com.anonymous.network_tracker.ui.components.UsageRangePicker
import com.anonymous.network_tracker.ui.components.UsageChart
import com.anonymous.network_tracker.ui.components.UsageError
import com.anonymous.network_tracker.data.util.customRangeProblem
import com.anonymous.network_tracker.data.util.quotaPercent
import java.text.DateFormat
import java.util.Date
import java.util.Calendar

@Composable
fun OverviewScreen(
    onNavigateToAppDetail: (uid: Int) -> Unit,
    modifier: Modifier = Modifier,
    usageState: UsageState = rememberUsageState(),
    familyRequest: @Composable () -> Unit = {}
) {
    val context = LocalContext.current
    val repo = remember(context) { UsageRepository.getInstance(context) }
    val settingsRepo = remember(context) { SettingsRepository.getInstance(context) }
    var settings by remember { mutableStateOf(settingsRepo.loadSettings()) }
    val selectedPreset = usageState.selectedPreset
    val selectedNetwork = usageState.selectedNetwork
    var appList by remember { mutableStateOf<List<AppUsageItem>>(emptyList()) }
    var wifiSlices by remember { mutableStateOf<List<WifiNetworkSlice>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var quotaError by remember { mutableStateOf<String?>(null) }
    var cycleTotal by remember { mutableLongStateOf(0) }
    var hasPermission by remember { mutableStateOf(UsageAccess.has(context)) }
    LaunchedOnResumeEffect(usageState.now) {
        hasPermission = UsageAccess.has(context)
        settings = settingsRepo.loadSettings()
    }
    val activeRange = usageState.activeRange(settings.cycleStartDay)
    LaunchedEffect(activeRange, selectedNetwork, hasPermission, usageState.now) {
        appList = emptyList()
        wifiSlices = emptyList()
        error = null
        if (hasPermission) {
            isLoading = true
            try {
                val apps = repo.getUsage(activeRange, selectedNetwork)
                val slices = if (selectedNetwork != "MOBILE") repo.getUsageByWifiNetwork(activeRange) else emptyList()
                appList = apps
                wifiSlices = slices
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { error = e.message ?: e.javaClass.simpleName }
            finally { isLoading = false }
        }
    }
    val cycleRange = RangeUtils.billingCycleRange(settings.cycleStartDay, usageState.now)
    LaunchedEffect(cycleRange, selectedNetwork, hasPermission, settings.mobileLimitBytes, settings.wifiLimitBytes) {
        cycleTotal = 0
        quotaError = null
        if (hasPermission && selectedNetwork != "ALL") {
            try { cycleTotal = repo.getUsage(cycleRange, selectedNetwork).sumOf { it.total } }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { quotaError = e.message ?: e.javaClass.simpleName }
        }
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
                .verticalScroll(rememberScrollState())
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
                        text = tr("NetTrack"),
                        color = TextPrimary,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = tr("Cycle renewal: Day %d", settings.cycleStartDay),
                        color = TextMuted,
                        fontSize = 12.sp
                    )
                }

                IconButton(
                    onClick = { usageState.refresh() },
                    modifier = Modifier
                        .size(38.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(DarkSurface)
                ) {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = tr("Refresh"),
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
                    label = tr("Mobile"),
                    isSelected = selectedNetwork == "MOBILE",
                    onClick = { usageState.selectedNetwork = "MOBILE" },
                    modifier = Modifier.weight(1f)
                )
                NetworkFilterTab(
                    icon = Icons.Default.Wifi,
                    label = tr("Wi-Fi"),
                    isSelected = selectedNetwork == "WIFI",
                    onClick = { usageState.selectedNetwork = "WIFI" },
                    modifier = Modifier.weight(1f)
                )
                NetworkFilterTab(
                    icon = Icons.Default.Language,
                    label = tr("All Traffic"),
                    isSelected = selectedNetwork == "ALL",
                    onClick = { usageState.selectedNetwork = "ALL" },
                    modifier = Modifier.weight(1f)
                )
            }

            UsageRangePicker(usageState, settings.cycleStartDay)

            // Data Limit Card (if limit is configured for the active network)
            if (activeLimitBytes != null && activeLimitBytes > 0) {
                val percent = quotaPercent(cycleTotal, activeLimitBytes)
                val usedPct = (percent / 100).toFloat().coerceIn(0f, 1f)
                val isWarning = percent >= warnPercent

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
                                text = if (selectedNetwork == "MOBILE") tr("Mobile Data Limit") else tr("Wi-Fi Data Limit"),
                                color = if (isWarning) AccentSecondary else TextPrimary,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = tr("%.1f%% used", percent),
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
                            text = tr("%s of %s limit", repo.formatBytes(cycleTotal), repo.formatBytes(activeLimitBytes)),
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                    }
                }
            }

            UsageError(quotaError) { usageState.refresh() }
            familyRequest()

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

            UsageChart(activeRange, selectedNetwork, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
            UsageError(error) { usageState.refresh() }

            // Apps List Header with System Apps counter
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = tr("Applications (%d)", visibleApps.size),
                    color = TextSecondary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = tr("Sorted by Usage"),
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
                            settings = settingsRepo.update { it.copy(showSystemApps = true) }
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
                            text = tr("%d system apps hidden (%s)", hiddenApps.size, repo.formatBytes(hiddenTotal)),
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                        Text(
                            text = tr("Show"),
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
                    modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp, max = 600.dp),
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
                    text = tr("Usage Access Required"),
                    color = AccentSecondary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = tr("Permission is needed to query per-app network consumption from Android."),
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
                Text(tr("Grant"), color = MaterialTheme.colorScheme.onSecondary, fontSize = 12.sp)
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
                text = tr("Total Consumption"),
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
                        contentDescription = tr("Download"),
                        tint = AccentPrimary,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(tr("Download: %s", rxFormatted), color = TextSecondary, fontSize = 13.sp)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.ArrowUpward,
                        contentDescription = tr("Upload"),
                        tint = AccentSecondary,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(tr("Upload: %s", txFormatted), color = TextSecondary, fontSize = 13.sp)
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
                    text = tr("Wi-Fi Networks Breakdown"),
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
                    text = tr("Down: %s • Up: %s", formatBytes(item.download), formatBytes(item.upload)),
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
