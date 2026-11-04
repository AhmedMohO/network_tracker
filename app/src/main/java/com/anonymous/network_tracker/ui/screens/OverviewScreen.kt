package com.anonymous.network_tracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Wifi
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

@Composable
fun OverviewScreen(
    onNavigateToAppDetail: (uid: Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val repo = remember(context) { UsageRepository.getInstance(context) }
    val settingsRepo = remember(context) { SettingsRepository.getInstance(context) }
    val scope = rememberCoroutineScope()

    var selectedPreset by remember { mutableStateOf(PresetId.TODAY) }
    var selectedNetwork by remember { mutableStateOf("ALL") } // "ALL", "MOBILE", "WIFI"
    var appList by remember { mutableStateOf<List<AppUsageItem>>(emptyList()) }
    var wifiSlices by remember { mutableStateOf<List<WifiNetworkSlice>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var hasPermission by remember { mutableStateOf(UsageAccess.has(context)) }

    val settings = remember { settingsRepo.loadSettings() }
    val dateRange = remember(selectedPreset, settings.cycleStartDay) {
        RangeUtils.presetRange(selectedPreset, cycleStartDay = settings.cycleStartDay)
    }

    fun loadData() {
        if (!hasPermission) return
        isLoading = true
        scope.launch {
            try {
                appList = repo.getUsage(dateRange, selectedNetwork)
                if (selectedNetwork == "WIFI" || selectedNetwork == "ALL") {
                    wifiSlices = repo.getUsageByWifiNetwork(dateRange)
                }
            } catch (_: Exception) {
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(selectedPreset, selectedNetwork, hasPermission) {
        loadData()
    }

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
                    .padding(horizontal = 20.dp, vertical = 14.dp),
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
                        text = "Usage Dashboard",
                        color = TextSecondary,
                        fontSize = 14.sp
                    )
                }
                IconButton(onClick = {
                    hasPermission = UsageAccess.has(context)
                    loadData()
                }) {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = "Refresh",
                        tint = AccentSecondary
                    )
                }
            }

            if (!hasPermission) {
                PermissionBanner {
                    UsageAccess.open(context)
                }
            }

            // Interval chip selector
            LazyRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val presets = listOf(
                    PresetId.TODAY to "Today",
                    PresetId.YESTERDAY to "Yesterday",
                    PresetId.LAST_7D to "7 Days",
                    PresetId.LAST_30D to "30 Days",
                    PresetId.THIS_CYCLE to "This Cycle"
                )
                items(presets) { (preset, label) ->
                    val isSelected = selectedPreset == preset
                    FilterChip(
                        selected = isSelected,
                        onClick = { selectedPreset = preset },
                        label = { Text(label, fontSize = 13.sp) },
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

            // Network filter pills (All / Mobile / Wi-Fi)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                NetworkPill(
                    label = "All Traffic",
                    isSelected = selectedNetwork == "ALL",
                    onClick = { selectedNetwork = "ALL" },
                    modifier = Modifier.weight(1f)
                )
                NetworkPill(
                    label = "Mobile",
                    isSelected = selectedNetwork == "MOBILE",
                    onClick = { selectedNetwork = "MOBILE" },
                    modifier = Modifier.weight(1f)
                )
                NetworkPill(
                    label = "Wi-Fi",
                    isSelected = selectedNetwork == "WIFI",
                    onClick = { selectedNetwork = "WIFI" },
                    modifier = Modifier.weight(1f)
                )
            }

            // Totals Summary Card
            val totalRx = appList.sumOf { it.download }
            val totalTx = appList.sumOf { it.upload }
            val totalBytes = totalRx + totalTx

            TotalsCard(
                totalFormatted = repo.formatBytes(totalBytes),
                rxFormatted = repo.formatBytes(totalRx),
                txFormatted = repo.formatBytes(totalTx),
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
            )

            // Wi-Fi Per-Network Card if Wi-Fi active and slices available
            if ((selectedNetwork == "WIFI" || selectedNetwork == "ALL") && wifiSlices.size > 1) {
                WifiSlicesCard(
                    slices = wifiSlices,
                    formatBytes = { repo.formatBytes(it) },
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
                )
            }

            // Apps List Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Applications (${appList.size})",
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
                    items(appList, key = { it.uid }) { item ->
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
fun NetworkPill(
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (isSelected) AccentPrimary else DarkSurface)
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            color = if (isSelected) TextPrimary else TextSecondary,
            fontSize = 13.sp,
            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
        )
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
                text = "Total Consumed",
                color = TextSecondary,
                fontSize = 13.sp
            )
            Text(
                text = totalFormatted,
                color = TextPrimary,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(vertical = 4.dp)
            )
            Divider(color = DarkBorder, modifier = Modifier.padding(vertical = 10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.ArrowDownward,
                        contentDescription = "Download",
                        tint = SuccessGreen,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(text = "Down: $rxFormatted", color = TextSecondary, fontSize = 13.sp)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.ArrowUpward,
                        contentDescription = "Upload",
                        tint = AccentSecondary,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(text = "Up: $txFormatted", color = TextSecondary, fontSize = 13.sp)
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
                    tint = WifiPurple,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Wi-Fi Networks Breakdown",
                    color = TextPrimary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            slices.take(4).forEach { slice ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 3.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = slice.ssid ?: "Other / Unattributed",
                        color = TextSecondary,
                        fontSize = 13.sp,
                        maxLines = 1
                    )
                    Text(
                        text = formatBytes(slice.totals.total),
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
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = DarkSurface)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                AppIconImage(
                    packageName = item.packageName,
                    appName = item.name,
                    size = 42.dp
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
                    Text(
                        text = item.packageName ?: "System Process",
                        color = TextMuted,
                        fontSize = 12.sp,
                        maxLines = 1
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = formatBytes(item.total),
                        color = TextPrimary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = String.format("%.1f%%", item.percentage),
                        color = AccentSecondary,
                        fontSize = 12.sp
                    )
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            LinearProgressIndicator(
                progress = { (item.percentage / 100.0).toFloat().coerceIn(0.01f, 1f) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp)),
                color = AccentPrimary,
                trackColor = DarkSurfaceVariant
            )
        }
    }
}

@Composable
fun PermissionBanner(onGrantClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = DarkSurfaceVariant)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                text = "Usage Access Required",
                color = WarningAmber,
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Android requires Usage Access permission to track per-app network consumption.",
                color = TextSecondary,
                fontSize = 13.sp
            )
            Spacer(modifier = Modifier.height(10.dp))
            Button(
                onClick = onGrantClick,
                colors = ButtonDefaults.buttonColors(containerColor = AccentPrimary),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text("Grant Usage Access", color = TextPrimary, fontSize = 13.sp)
            }
        }
    }
}
