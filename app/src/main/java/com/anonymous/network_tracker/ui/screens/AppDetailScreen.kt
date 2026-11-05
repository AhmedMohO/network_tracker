package com.anonymous.network_tracker.ui.screens

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anonymous.network_tracker.core.AppResolver
import com.anonymous.network_tracker.data.model.AppUsageItem
import com.anonymous.network_tracker.data.repository.UsageRepository
import com.anonymous.network_tracker.data.util.PresetId
import com.anonymous.network_tracker.data.util.RangeUtils
import com.anonymous.network_tracker.ui.components.AppIconImage
import com.anonymous.network_tracker.ui.theme.*
import kotlinx.coroutines.CancellationException
import com.anonymous.network_tracker.ui.*
import com.anonymous.network_tracker.ui.components.UsageChart
import com.anonymous.network_tracker.ui.components.UsageError
import com.anonymous.network_tracker.data.repository.SettingsRepository
import com.anonymous.network_tracker.data.model.WifiNetworkSlice
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll

@Composable
fun AppDetailScreen(
    uid: Int,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    usageState: UsageState = rememberUsageState()
) {
    val context = LocalContext.current
    val repo = remember(context) { UsageRepository.getInstance(context) }
    val settingsRepo = remember(context) { SettingsRepository.getInstance(context) }
    var settings by remember { mutableStateOf(settingsRepo.loadSettings()) }
    LaunchedOnResumeEffect(usageState.now) { settings = settingsRepo.loadSettings() }
    val range = usageState.activeRange(settings.cycleStartDay)
    val network = usageState.selectedNetwork
    var appItem by remember { mutableStateOf<AppUsageItem?>(null) }
    var wifiSlices by remember { mutableStateOf<List<WifiNetworkSlice>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(uid, range, network, usageState.now) {
        appItem = null
        wifiSlices = emptyList()
        error = null
        isLoading = true
        try {
            appItem = repo.getUsage(range, network).find { it.uid == uid }
            if (network != "MOBILE") {
                wifiSlices = repo.getUsageByWifiNetwork(range).mapNotNull { slice ->
                    val apps = slice.apps.filter { it.uid == uid }
                    if (apps.isEmpty()) null else slice.copy(apps = apps, totals = com.anonymous.network_tracker.data.model.UsageTotals(
                        apps.sumOf { it.download }, apps.sumOf { it.upload }, apps.sumOf { it.total }))
                }
            }
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) { error = e.message ?: e.javaClass.simpleName }
        finally { isLoading = false }
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
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = tr("Back"),
                        tint = TextPrimary
                    )
                }
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = tr("App Details"),
                    color = TextPrimary,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            UsageError(error) { usageState.refresh() }
            if (isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = AccentPrimary)
                }
            } else {
                val app = appItem
                if (app != null) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = DarkSurface)
                    ) {
                        Column(
                            modifier = Modifier.padding(20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            AppIconImage(
                                packageName = app.packageName,
                                appName = app.name,
                                size = 64.dp
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                text = app.name,
                                color = TextPrimary,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = app.packageName ?: tr("System Process (UID %d)", uid),
                                color = TextMuted,
                                fontSize = 13.sp
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                text = repo.formatBytes(app.total),
                                color = AccentSecondary,
                                fontSize = 28.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = tr("Total Data") + " · " + tr(network) + " · " + java.text.DateFormat.getDateTimeInstance().format(java.util.Date(range.start)) + " – " + java.text.DateFormat.getDateTimeInstance().format(java.util.Date(range.end)),
                                color = TextSecondary,
                                fontSize = 12.sp
                            )
                        }
                    }

                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = DarkSurface)
                    ) {
                        Column(modifier = Modifier.padding(18.dp)) {
                            Text(
                                text = tr("Traffic Breakdown"),
                                color = TextPrimary,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        imageVector = Icons.Default.ArrowDownward,
                                        contentDescription = null,
                                        tint = SuccessGreen,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(tr("Download"), color = TextSecondary, fontSize = 13.sp)
                                }
                                Text(repo.formatBytes(app.download), color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            }
                            Divider(color = DarkBorder, modifier = Modifier.padding(vertical = 10.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        imageVector = Icons.Default.ArrowUpward,
                                        contentDescription = null,
                                        tint = AccentSecondary,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(tr("Upload"), color = TextSecondary, fontSize = 13.sp)
                                }
                                Text(repo.formatBytes(app.upload), color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            }
                            if (app.foreground > 0 || app.background > 0) {
                                Divider(color = DarkBorder, modifier = Modifier.padding(vertical = 10.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(tr("Foreground Usage"), color = TextSecondary, fontSize = 13.sp)
                                    Text(repo.formatBytes(app.foreground), color = TextPrimary, fontSize = 13.sp)
                                }
                                Spacer(modifier = Modifier.height(6.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(tr("Background Usage"), color = TextSecondary, fontSize = 13.sp)
                                    Text(repo.formatBytes(app.background), color = TextPrimary, fontSize = 13.sp)
                                }
                            }
                        }
                    }

                    UsageChart(range, network, uid)
                    if (wifiSlices.isNotEmpty()) WifiSlicesCard(wifiSlices, { repo.formatBytes(it) })

                    if (app.packageName != null) {
                        Button(
                            onClick = {
                                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                                    .setData(Uri.fromParts("package", app.packageName, null))
                                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                context.startActivity(intent)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceVariant),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(
                                imageVector = Icons.Default.Settings,
                                contentDescription = null,
                                tint = AccentSecondary,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(tr("Open System App Settings"), color = AccentSecondary)
                        }
                    }
                } else {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(tr("No data found for this application."), color = TextMuted)
                    }
                }
            }
        }
    }
}

