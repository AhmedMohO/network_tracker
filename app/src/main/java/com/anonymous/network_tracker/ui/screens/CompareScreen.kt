package com.anonymous.network_tracker.ui.screens

import androidx.compose.foundation.background
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
import com.anonymous.network_tracker.data.model.AppUsageItem
import com.anonymous.network_tracker.data.repository.SettingsRepository
import com.anonymous.network_tracker.data.repository.UsageRepository
import com.anonymous.network_tracker.data.util.PresetId
import com.anonymous.network_tracker.data.util.RangeUtils
import com.anonymous.network_tracker.ui.components.AppIconImage
import com.anonymous.network_tracker.ui.theme.*
import kotlinx.coroutines.launch

data class AppComparison(
    val uid: Int,
    val name: String,
    val packageName: String?,
    val usageCurrent: Long,
    val usagePrevious: Long,
    val deltaBytes: Long,
    val deltaPercent: Double
)

@Composable
fun CompareScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val repo = remember(context) { UsageRepository.getInstance(context) }
    val settingsRepo = remember(context) { SettingsRepository.getInstance(context) }
    val scope = rememberCoroutineScope()

    var settings by remember { mutableStateOf(settingsRepo.loadSettings()) }
    var selectedPreset by remember { mutableStateOf(PresetId.THIS_CYCLE) }
    var selectedNetwork by remember { mutableStateOf("MOBILE") } // "MOBILE", "WIFI", "ALL"

    var comparisonList by remember { mutableStateOf<List<AppComparison>>(emptyList()) }
    var currentTotal by remember { mutableLongStateOf(0L) }
    var previousTotal by remember { mutableLongStateOf(0L) }
    var isLoading by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        settings = settingsRepo.loadSettings()
    }

    val currentRange = remember(selectedPreset, settings.cycleStartDay) {
        RangeUtils.presetRange(selectedPreset, cycleStartDay = settings.cycleStartDay)
    }

    val previousRange = remember(currentRange, settings.cycleStartDay) {
        RangeUtils.previousRange(currentRange, cycleStartDay = settings.cycleStartDay)
    }

    fun loadComparison() {
        isLoading = true
        scope.launch {
            try {
                val currentApps = repo.getUsage(currentRange, selectedNetwork)
                val previousApps = repo.getUsage(previousRange, selectedNetwork)

                val (visibleCurrent, _) = if (settings.showSystemApps) currentApps to emptyList() else currentApps.partition { it.uid >= 10000 || it.uid == -5 }
                val (visiblePrevious, _) = if (settings.showSystemApps) previousApps to emptyList() else previousApps.partition { it.uid >= 10000 || it.uid == -5 }

                currentTotal = visibleCurrent.sumOf { it.total }
                previousTotal = visiblePrevious.sumOf { it.total }

                val currentMap = visibleCurrent.associateBy { it.uid }
                val previousMap = visiblePrevious.associateBy { it.uid }

                val allUids = currentMap.keys + previousMap.keys
                comparisonList = allUids.mapNotNull { uid ->
                    val curr = currentMap[uid]
                    val prev = previousMap[uid]

                    val usageA = curr?.total ?: 0L
                    val usageB = prev?.total ?: 0L
                    val name = curr?.name ?: prev?.name ?: "Unknown ($uid)"
                    val pkg = curr?.packageName ?: prev?.packageName
                    val deltaBytes = usageA - usageB
                    val deltaPercent = if (usageB > 0) ((usageA - usageB).toDouble() / usageB.toDouble()) * 100.0 else if (usageA > 0) 100.0 else 0.0

                    AppComparison(
                        uid = uid,
                        name = name,
                        packageName = pkg,
                        usageCurrent = usageA,
                        usagePrevious = usageB,
                        deltaBytes = deltaBytes,
                        deltaPercent = deltaPercent
                    )
                }.sortedByDescending { it.usageCurrent }
            } catch (_: Exception) {
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(currentRange, previousRange, selectedNetwork, settings.showSystemApps) {
        loadComparison()
    }

    val overallDeltaPercent = if (previousTotal > 0) {
        ((currentTotal - previousTotal).toDouble() / previousTotal.toDouble()) * 100.0
    } else {
        0.0
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
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Period Comparison",
                        color = TextPrimary,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Cycle renewal day: ${settings.cycleStartDay}",
                        color = TextMuted,
                        fontSize = 12.sp
                    )
                }

                IconButton(
                    onClick = { loadComparison() },
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

            // Network filter tabs
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

            // Period chip selector
            LazyRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val presets = listOf(
                    PresetId.THIS_CYCLE to "This Cycle vs Last",
                    PresetId.TODAY to "Today vs Yesterday",
                    PresetId.LAST_7D to "7 Days vs Prior 7D",
                    PresetId.LAST_30D to "30 Days vs Prior 30D"
                )
                items(presets) { (preset, label) ->
                    val isSelected = selectedPreset == preset
                    FilterChip(
                        selected = isSelected,
                        onClick = { selectedPreset = preset },
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

            // Summary Comparison Card
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("Current Period", color = TextSecondary, fontSize = 12.sp)
                            Text(repo.formatBytes(currentTotal), color = TextPrimary, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text("Previous Period", color = TextSecondary, fontSize = 12.sp)
                            Text(repo.formatBytes(previousTotal), color = TextMuted, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))
                    HorizontalDivider(color = DarkBorder, thickness = 0.5.dp)
                    Spacer(modifier = Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Overall Period Change", color = TextSecondary, fontSize = 13.sp)
                        val isUp = overallDeltaPercent > 0
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = if (isUp) AccentSecondary.copy(alpha = 0.15f) else Color(0xFF10B981).copy(alpha = 0.15f)
                        ) {
                            Text(
                                text = "${if (isUp) "+" else ""}${"%.1f".format(overallDeltaPercent)}%",
                                color = if (isUp) AccentSecondary else Color(0xFF10B981),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }
                }
            }

            // Applications Comparison List
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
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(comparisonList, key = { it.uid }) { comp ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
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
                                    packageName = comp.packageName,
                                    appName = comp.name,
                                    modifier = Modifier
                                        .size(38.dp)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(DarkSurfaceVariant)
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = comp.name,
                                        color = TextPrimary,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        maxLines = 1
                                    )
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        text = "Now: ${repo.formatBytes(comp.usageCurrent)} • Before: ${repo.formatBytes(comp.usagePrevious)}",
                                        color = TextMuted,
                                        fontSize = 11.sp
                                    )
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                val isAppUp = comp.deltaBytes > 0
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = if (isAppUp) AccentSecondary.copy(alpha = 0.15f) else Color(0xFF10B981).copy(alpha = 0.15f)
                                ) {
                                    Text(
                                        text = "${if (isAppUp) "+" else ""}${"%.0f".format(comp.deltaPercent)}%",
                                        color = if (isAppUp) AccentSecondary else Color(0xFF10B981),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
