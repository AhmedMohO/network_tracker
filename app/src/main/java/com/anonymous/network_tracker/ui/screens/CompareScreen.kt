package com.anonymous.network_tracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
    val usageA: Long,
    val usageB: Long,
    val deltaBytes: Long,
    val deltaPercent: Double
)

@Composable
fun CompareScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val repo = remember(context) { UsageRepository.getInstance(context) }
    val settingsRepo = remember(context) { SettingsRepository.getInstance(context) }
    val scope = rememberCoroutineScope()

    var comparisonList by remember { mutableStateOf<List<AppComparison>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }

    val settings = remember { settingsRepo.loadSettings() }

    LaunchedEffect(Unit) {
        isLoading = true
        scope.launch {
            try {
                val rangeA = RangeUtils.presetRange(PresetId.TODAY, cycleStartDay = settings.cycleStartDay)
                val rangeB = RangeUtils.presetRange(PresetId.YESTERDAY, cycleStartDay = settings.cycleStartDay)

                val appsA = repo.getUsage(rangeA).associateBy { it.uid }
                val appsB = repo.getUsage(rangeB).associateBy { it.uid }

                val allUids = appsA.keys + appsB.keys
                val comps = allUids.mapNotNull { uid ->
                    val a = appsA[uid]
                    val b = appsB[uid]
                    val item = a ?: b ?: return@mapNotNull null

                    val valA = a?.total ?: 0L
                    val valB = b?.total ?: 0L
                    val delta = valA - valB
                    val pct = if (valB > 0) ((delta.toDouble() / valB.toDouble()) * 100.0) else (if (valA > 0) 100.0 else 0.0)

                    AppComparison(
                        uid = uid,
                        name = item.name,
                        packageName = item.packageName,
                        usageA = valA,
                        usageB = valB,
                        deltaBytes = delta,
                        deltaPercent = pct
                    )
                }.sortedByDescending { kotlin.math.abs(it.deltaBytes) }

                comparisonList = comps
            } catch (_: Exception) {
            } finally {
                isLoading = false
            }
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
                .padding(horizontal = 20.dp, vertical = 14.dp)
        ) {
            Column {
                Text(
                    text = "Usage Comparison",
                    color = TextPrimary,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Today vs. Yesterday consumption delta",
                    color = TextSecondary,
                    fontSize = 14.sp
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            if (isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = AccentPrimary)
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(comparisonList, key = { it.uid }) { comp ->
                        CompareRow(comp = comp, formatBytes = { repo.formatBytes(it) })
                    }
                }
            }
        }
    }
}

@Composable
fun CompareRow(
    comp: AppComparison,
    formatBytes: (Long) -> String
) {
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
                size = 38.dp
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
                Text(
                    text = "Today: ${formatBytes(comp.usageA)} | Yest: ${formatBytes(comp.usageB)}",
                    color = TextMuted,
                    fontSize = 12.sp
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                val isPositive = comp.deltaBytes >= 0
                val prefix = if (isPositive) "+" else ""
                Text(
                    text = "$prefix${formatBytes(comp.deltaBytes)}",
                    color = if (isPositive) DangerRed else SuccessGreen,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "$prefix${String.format("%.1f", comp.deltaPercent)}%",
                    color = if (isPositive) DangerRed else SuccessGreen,
                    fontSize = 11.sp
                )
            }
        }
    }
}
