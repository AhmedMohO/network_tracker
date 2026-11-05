package com.anonymous.network_tracker.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.anonymous.network_tracker.core.*
import com.anonymous.network_tracker.data.model.SeriesQuery
import com.anonymous.network_tracker.data.repository.*
import com.anonymous.network_tracker.data.util.*
import com.anonymous.network_tracker.ui.LaunchedOnResumeEffect
import com.anonymous.network_tracker.ui.theme.*
import kotlinx.coroutines.*
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket

@Composable
fun ProbeScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val repo = remember(context) { UsageRepository.getInstance(context) }
    val settings = remember(context) { SettingsRepository.getInstance(context) }
    val scope = rememberCoroutineScope()
    var granted by remember { mutableStateOf(UsageAccess.has(context)) }
    var running by remember { mutableStateOf(false) }
    var job by remember { mutableStateOf<Job?>(null) }
    var output by remember { mutableStateOf<List<Pair<String, List<Any?>>>>(emptyList()) }
    fun line(key: String, vararg args: Any?) = key to args.toList()
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedOnResumeEffect(context) {
        granted = UsageAccess.has(context)
        try { awaitCancellation() } finally { job?.cancel() }
    }
    fun run(block: suspend () -> Unit) {
        if (running) return
        job = scope.launch {
            running = true
            error = null
            output = emptyList()
            try { block() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { error = e.message ?: e.javaClass.simpleName }
            finally { running = false }
        }
    }
    val testTitle = tr("Test notification")
    val testBody = tr("Usage alerts can be delivered on this device.")
    val blocked = "Notifications are blocked. Enable them in Android settings."
    fun sendTest() {
        try {
            if (!repo.sendNotification(4713, testTitle, testBody)) { error = blocked; return }
            output = listOf(line("Test notification sent."))
        } catch (e: Exception) { error = e.message ?: e.javaClass.simpleName }
    }
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        if (it) sendTest() else error = blocked
    }

    Scaffold(modifier = modifier.fillMaxSize(), containerColor = DarkBackground) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(tr("Diagnostics Probe"), color = TextPrimary, style = MaterialTheme.typography.headlineSmall)
            Text(if (granted) tr("Usage access granted") else tr("Usage access required"), color = if (granted) SuccessGreen else DangerRed)
            if (!granted) Button(onClick = { UsageAccess.open(context) }) { Text(tr("Open usage access settings")) }
            if (running) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                TextButton(onClick = { job?.cancel() }) { Text(tr("Stop probe")) }
            }
            Card(colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(tr("Usage queries (last 7 days)"), color = TextPrimary)
                    listOf("MOBILE", "WIFI", "ALL").forEach { network ->
                        Button(enabled = !running && granted, onClick = { run {
                            val usage = repo.getUsage(RangeUtils.presetRange(PresetId.LAST_7D), network)
                            output = listOf(line("%s: %s", network, repo.formatBytes(usage.sumOf { it.total }))) + usage.take(20).map { line("%s: %s (UID %d)", it.name, repo.formatBytes(it.total), it.uid) }
                        } }) { Text(tr(network)) }
                    }
                    Button(enabled = !running && granted, onClick = { run {
                        val now = System.currentTimeMillis()
                        val series = withContext(Dispatchers.IO) { StatsReader(context).series(SeriesQuery(now - RangeUtils.DAY_MS, now, "ALL", 60_000)) }
                        output = listOf(line("%d bins; requested 60 s", series.bins.size), line("Coverage: %s - %s", java.util.Date(series.coveredStart), java.util.Date(series.coveredEnd))) +
                            series.bins.filter { it.rxBytes + it.txBytes > 0 }.take(20).map { line("%s: %s", java.util.Date(it.start), repo.formatBytes(it.rxBytes + it.txBytes)) }
                    } }) { Text(tr("Run granularity probe")) }
                    Button(enabled = !running, onClick = { run {
                        var previous = LiveProbe.counters()
                        var last = android.os.SystemClock.elapsedRealtime()
                        repeat(30) { i ->
                            delay(1000)
                            val now = android.os.SystemClock.elapsedRealtime()
                            val counters = LiveProbe.counters()
                            val elapsed = (now - last).coerceAtLeast(1) / 1000.0
                            val down = (((counters["totalRx"] ?: 0) - (previous["totalRx"] ?: 0)).coerceAtLeast(0) / elapsed).toLong()
                            val up = (((counters["totalTx"] ?: 0) - (previous["totalTx"] ?: 0)).coerceAtLeast(0) / elapsed).toLong()
                            val foreground = withContext(Dispatchers.IO) { LiveProbe.foregroundPackage(context) }
                            output = output + line("%ds: %s/s down; %s/s up | %s | %s%% | %s", i + 1, repo.formatBytes(down), repo.formatBytes(up), LiveProbe.connection(context), LiveProbe.batteryPercent(context), foreground)
                            previous = counters
                            last = now
                        }
                    } }) { Text(tr("Run device speed probe (30 seconds)")) }
                    Button(enabled = !running && granted, onClick = { run {
                        repeat(12) { i ->
                            val now = System.currentTimeMillis()
                            val apps = repo.getUsage(DateRange(now - 10_000, now), "ALL")
                            output = output + line("%ds: %s", i * 5, apps.filter { it.total > 0 }.take(8).joinToString { "${it.name}: ${repo.formatBytes(it.total)}" })
                            delay(5000)
                        }
                    } }) { Text(tr("Run per-app live probe (60 seconds)")) }
                }
            }
            Card(colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(tr("Alerts and background checks"), color = TextPrimary)
                    Button(enabled = !running, onClick = {
                        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                        else sendTest()
                    }) { Text(tr("Send test notification")) }
                    Button(enabled = !running && granted, onClick = { run {
                        repo.performBackgroundCheck()
                        output = listOf(line("%s", settings.loadSettings().alertedKeys))
                    } }) { Text(tr("Run usage check")) }
                    Button(enabled = !running, onClick = { settings.resetAlertKeys(); output = listOf(line("[]")) }) { Text(tr("Reset alerted keys")) }
                }
            }
            Button(enabled = !running, onClick = { run {
                for ((host, port) in listOf("1.1.1.1" to 53, "8.8.8.8" to 53, "www.google.com" to 443, "www.cloudflare.com" to 443)) {
                    val result = withContext(Dispatchers.IO) {
                        val start = android.os.SystemClock.elapsedRealtime()
                        try {
                            val address = InetAddress.getByName(host)
                            Socket().use { it.connect(InetSocketAddress(address, port), 3000) }
                            line("%s (%s): %d ms", host, address.hostAddress, android.os.SystemClock.elapsedRealtime() - start)
                        } catch (e: CancellationException) { throw e }
                        catch (e: Exception) { line("%s: %s", host, e.message ?: e.javaClass.simpleName) }
                    }
                    output = output + result
                }
            } }) { Text(tr("Test connectivity")) }
            error?.let { Text(tr(it), color = DangerRed) }
            if (output.isNotEmpty()) Text(buildString { output.forEach { appendLine(tr(it.first, *it.second.toTypedArray())) } }.trimEnd(), color = TextSecondary, style = MaterialTheme.typography.bodySmall)
        }
    }
}
