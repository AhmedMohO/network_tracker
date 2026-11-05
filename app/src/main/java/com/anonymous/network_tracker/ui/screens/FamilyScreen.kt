package com.anonymous.network_tracker.ui.screens

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.anonymous.network_tracker.data.family.*
import com.anonymous.network_tracker.data.repository.*
import com.anonymous.network_tracker.data.util.RangeUtils
import com.anonymous.network_tracker.ui.UsageState
import com.anonymous.network_tracker.ui.components.*
import com.anonymous.network_tracker.ui.LaunchedOnResumeEffect
import com.anonymous.network_tracker.ui.rememberUsageState
import com.anonymous.network_tracker.ui.theme.*
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.google.zxing.BarcodeFormat
import com.google.zxing.MultiFormatWriter
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date

private fun Context.activity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.takeUnless { it === this }?.activity()
    else -> null
}
private fun familyDate(at: Long): String = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(at))
private fun gbBytes(raw: String): Long? {
    val gb = raw.toDoubleOrNull() ?: return null
    return (gb * 1_073_741_824.0).takeIf { it.isFinite() && it >= 1 && it < Long.MAX_VALUE.toDouble() }?.toLong()
}

@Composable
fun FamilyScreen(onBack: () -> Unit, modifier: Modifier = Modifier, initialPairLink: String? = null) {
    val context = LocalContext.current
    val settingsRepo = remember(context) { SettingsRepository.getInstance(context) }
    val repo = remember(context) { FamilyRepository.getInstance(context) }
    val scope = rememberCoroutineScope()
    var settings by remember { mutableStateOf(settingsRepo.loadSettings()) }
    var rows by remember { mutableStateOf<List<FamilySnapshot>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var label by remember { mutableStateOf(settings.deviceLabel ?: Build.MODEL) }
    var paste by remember { mutableStateOf("") }
    var pairing by remember { mutableStateOf<Pairing?>(null) }
    var showQr by remember { mutableStateOf(false) }
    var unpair by remember { mutableStateOf(false) }
    var selectedChild by remember { mutableStateOf<String?>(null) }
    var selectedApp by remember { mutableStateOf<Int?>(null) }
    val usageState = rememberUsageState()
    val shareTitle = tr("Share pairing link")
    suspend fun reload() { settings = settingsRepo.loadSettings(); rows = repo.readCache() }
    fun runAction(action: suspend () -> Unit) {
        if (busy) return
        busy = true; error = null
        scope.launch {
            try { action(); reload() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { error = e.message ?: e.javaClass.simpleName }
            finally { busy = false }
        }
    }
    fun preview(raw: String) {
        val parsed = parsePairLink(raw)
        if (parsed == null) error = "Invalid pairing link. Paste the complete nettrack://pair link."
        else if (settings.pairToken != null) error = "Unpair from your current family first."
        else { pairing = parsed; error = null }
    }
    LaunchedEffect(initialPairLink) { if (initialPairLink != null) preview(initialPairLink) }
    LaunchedOnResumeEffect(context) {
            try { reload() } catch (e: CancellationException) { throw e } catch (e: Exception) { error = e.message }
            while (true) {
                delay(15_000)
                try { reload() } catch (e: CancellationException) { throw e } catch (e: Exception) { error = e.message }
            }
            }
    LaunchedEffect(showQr) { if (showQr) { delay(120_000); showQr = false } }
    BackHandler(selectedChild != null) { if (selectedApp != null) selectedApp = null else selectedChild = null }
    val child = familyChildren(rows).firstOrNull { it.id == selectedChild }
    Scaffold(modifier.fillMaxSize(), containerColor = DarkBackground) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { if (selectedApp != null) selectedApp = null else if (selectedChild != null) selectedChild = null else onBack() }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, tr("Back"))
                }
                Text(child?.label ?: tr("Family Sharing & Sync"), style = MaterialTheme.typography.titleLarge, color = TextPrimary)
            }
            if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            if (error != null) Text(tr(error!!), color = DangerRed)
            if (settings.lastSyncErrorAt != null) Text(tr("Family sync has failed since %s. Cached data remains available.", familyDate(settings.lastSyncErrorAt!!)), color = DangerRed)
            if (settings.pairToken != null) {
                Text(tr("Last successful sync: %s", settings.lastSyncOkAt?.let(::familyDate) ?: tr("Never")), color = TextMuted)
                Text(tr(com.anonymous.network_tracker.service.push.FamilyPushRegistration.status(context)), color = TextMuted)
                OutlinedButton(enabled = !busy, onClick = { runAction { repo.sync() } }) { Text(tr("Sync now")) }
            }
            if (child != null && settings.familyRole == "parent") {
                FamilyChildDetail(child, rows.filter { it.deviceId == child.id }, settings, settingsRepo, repo, usageState, selectedApp,
                    { selectedApp = it }, busy, { action -> runAction(action) })
            } else {
                FamilyPanel {
                    Text(tr(when (settings.familyRole) { "parent" -> "Parent device"; "child" -> "Child device"; else -> "Pair your family" }), style = MaterialTheme.typography.titleMedium)
                    if (settings.pairToken == null) {
                        Text(tr("Create a family on the parent device, then scan or paste its link on a child device."))
                        OutlinedTextField(label, { label = it }, label = { Text(tr("Device label")) }, modifier = Modifier.fillMaxWidth())
                        Button(enabled = !busy && label.isNotBlank(), onClick = { runAction { repo.becomeParent(label) } }) { Text(tr("Create family as parent"), color = MaterialTheme.colorScheme.onPrimary) }
                        OutlinedButton(enabled = !busy, onClick = {
                            val activity = context.activity()
                            if (activity == null) error = "Scanner is unavailable. Paste the pairing link instead."
                            else try {
                                GmsBarcodeScanning.getClient(activity).startScan().addOnSuccessListener { code -> preview(code.rawValue.orEmpty()) }
                                    .addOnFailureListener { error = it.message ?: "Scanner is unavailable. Paste the pairing link instead." }
                            } catch (e: Exception) { error = e.message }
                        }) { Text(tr("Scan pairing QR")) }
                        OutlinedTextField(paste, { paste = it }, label = { Text(tr("Pairing link")) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                        OutlinedButton(enabled = !busy && paste.isNotBlank(), onClick = { preview(paste) }) { Text(tr("Review pairing")) }
                    } else {
                        OutlinedTextField(label, { label = it }, label = { Text(tr("Device label")) }, modifier = Modifier.fillMaxWidth())
                        OutlinedButton(enabled = !busy && label.isNotBlank(), onClick = { runAction { settingsRepo.update { it.copy(deviceLabel = label.trim()) } } }) { Text(tr("Save label")) }
                        if (settings.familyRole == "parent") {
                            val link = pairLink(settings.pairToken!!, settings.deviceLabel ?: Build.MODEL)
                            Button(enabled = !busy, onClick = {
                                try { context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, link), shareTitle)) }
                                catch (e: Exception) { error = e.message }
                            }) { Text(tr("Share pairing link"), color = MaterialTheme.colorScheme.onPrimary) }
                            OutlinedButton(onClick = { showQr = !showQr }) { Text(tr(if (showQr) "Hide QR" else "Show pairing QR")) }
                            if (showQr) FamilyQr(link)
                            Text(tr("Anyone with this link can join your family. Share it only with trusted devices."), color = TextMuted)
                        } else {
                            Text(tr("Sharing with %s", settings.pairedLabel.orEmpty()))
                            FamilyPrivacy()
                            Text(tr("Mobile data limit: %s", settings.mobileLimitBytes?.let { UsageRepository.getInstance(context).formatBytes(it) } ?: tr("Not set")))
                            FamilyRequestControls(onOpenFamily = null, alwaysShow = true)
                        }
                        OutlinedButton(enabled = !busy, onClick = { unpair = true }) { Text(tr(if (settings.familyRole == "parent") "Unpair all devices" else "Stop sharing and unpair"), color = DangerRed) }
                    }
                }
                if (settings.familyRole == "parent") {
                    Text(tr("Children"), style = MaterialTheme.typography.titleMedium, color = TextPrimary)
                    val children = familyChildren(rows)
                    if (children.isEmpty()) Text(tr("No children have checked in yet. Share your pairing link, then sync the child device."), color = TextMuted)
                    children.forEach { item ->
                        FamilyPanel(Modifier.clickable { selectedChild = item.id; selectedApp = null }) {
                            Text(item.label, style = MaterialTheme.typography.titleMedium)
                            Text(tr("Last check-in: %s", familyDate(item.lastSeen)), color = TextMuted)
                            if (System.currentTimeMillis() - item.lastSeen > 3 * 3_600_000L) Text(tr("Stale data. This device has not checked in recently."), color = DangerRed)
                            Text(tr("View usage and requests"), color = AccentPrimary)
                        }
                    }
                }
            }
        }
    }
    pairing?.let { candidate ->
        AlertDialog(onDismissRequest = { if (!busy) pairing = null }, title = { Text(tr("Share usage with %s?", candidate.label)) }, text = { FamilyPrivacy() },
            confirmButton = { TextButton(enabled = !busy, onClick = { runAction { repo.join(candidate); pairing = null; paste = ""; repo.sync() } }) { Text(tr("Agree and join")) } },
            dismissButton = { TextButton(enabled = !busy, onClick = { pairing = null }) { Text(tr("Cancel")) } })
    }
    if (unpair) AlertDialog(onDismissRequest = { if (!busy) unpair = false }, title = { Text(tr("Unpair family?")) },
        text = { Text(tr("This deletes shared family snapshots from the server for every paired device. Your local usage history stays on this device. A connection is required; pairing remains active if deletion fails.")) },
        confirmButton = { TextButton(enabled = !busy, onClick = { runAction { repo.unpair(); unpair = false; showQr = false; selectedChild = null } }) { Text(tr("Unpair"), color = DangerRed) } },
        dismissButton = { TextButton(enabled = !busy, onClick = { unpair = false }) { Text(tr("Cancel")) } })
}

@Composable
private fun FamilyPanel(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Card(modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
    }
}

@Composable
private fun FamilyPrivacy() {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(tr("Shares app names and data totals, daily history, Wi-Fi network names when enabled, current foreground app, battery level and connection status with the parent."))
        Text(tr("Messages, browsing history and file contents are never shared. You can stop sharing from this screen."))
    }
}

@Composable
private fun FamilyQr(link: String) {
    val qr = remember(link) { runCatching {
        val matrix = MultiFormatWriter().encode(link, BarcodeFormat.QR_CODE, 640, 640)
        Bitmap.createBitmap(640, 640, Bitmap.Config.ARGB_8888).apply {
            setPixels(IntArray(640 * 640) { i -> if (matrix[i % 640, i / 640]) android.graphics.Color.BLACK else android.graphics.Color.WHITE }, 0, 640, 0, 0, 640, 640)
        }.asImageBitmap()
    } }
    qr.getOrNull()?.let { Image(it, tr("Family pairing QR code"), Modifier.size(240.dp).background(Color.White)) }
        ?: Text(tr("Unable to create QR code. Share the pairing link instead."), color = DangerRed)
}

@Composable
private fun FamilyChildDetail(child: FamilyChild, rows: List<FamilySnapshot>, settings: AppSettings,
    settingsRepo: SettingsRepository, repo: FamilyRepository, state: UsageState, selectedApp: Int?, onApp: (Int?) -> Unit,
    busy: Boolean, runAction: (suspend () -> Unit) -> Unit) {
    val context = LocalContext.current
    val usage = remember(context) { UsageRepository.getInstance(context) }
    val range = state.activeRange(settings.cycleStartDay)
    val series = remember(rows, range, state.selectedNetwork, selectedApp) { buildFamilySeries(rows, range.start, range.end, state.selectedNetwork, state.now, selectedApp) }
    Text(tr("Last check-in: %s", familyDate(child.lastSeen)), color = TextMuted)
    val stale = state.now - child.lastSeen > 3 * 3_600_000L
    if (stale) Text(tr("Stale data. Usage and context reflect the last check-in, not current activity."), color = DangerRed)
    val recent = rows.filter { it.kind == "recent" }.maxByOrNull { it.updatedAt }
    recent?.payload?.optJSONObject("context")?.let { info ->
        FamilyPanel {
            val capturedAt = minOf(recent.updatedAt, recent.payload.optLong("at", recent.updatedAt))
            Text(tr("Device context as of %s", familyDate(capturedAt)))
            if (state.now - capturedAt <= 45 * 60_000L) {
                Text(tr("Connection: %s", tr(info.optString("connection", "Unknown"))))
                if (!info.isNull("batteryPercent")) Text(tr("Battery: %d%%", info.optInt("batteryPercent")))
                if (!info.isNull("foregroundPackage")) Text(tr("Foreground app: %s", payloadApps(recent.payload, "ALL").firstOrNull { it.packageName == info.optString("foregroundPackage") }?.name ?: info.optString("foregroundPackage")))
            } else Text(tr("Current device context is unavailable until the next check-in."))
        }
    }
    recent?.payload?.optJSONObject("coverage")?.let { coverage ->
        Text(tr("Reported coverage: %s – %s", familyDate(coverage.optLong("start")), familyDate(coverage.optLong("end"))), color = TextMuted)
    }
    UsageRangePicker(state, settings.cycleStartDay)
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf("ALL" to "All networks", "MOBILE" to "Mobile", "WIFI" to "Wi-Fi").forEach { (network, title) ->
            FilterChip(state.selectedNetwork == network, { state.selectedNetwork = network }, label = { Text(tr(title)) })
        }
    }
    if (selectedApp != null) TextButton(onClick = { onApp(null) }) { Text(tr("All child apps")) }
    FamilyPanel {
        Text(if (selectedApp == null) tr("Reported usage") else series.apps.firstOrNull()?.name ?: tr("App usage"), style = MaterialTheme.typography.titleMedium)
        Text(usage.formatBytes(series.total), style = MaterialTheme.typography.headlineMedium)
        if (selectedApp == null) {
            Text(tr("Mobile: %s · Wi-Fi: %s", series.mobile?.let(usage::formatBytes) ?: tr("Unknown"), series.wifi?.let(usage::formatBytes) ?: tr("Unknown")))
        }
        Text(tr("Shared history uses daily totals. Partial-day ranges include the whole reported day."), color = TextMuted)
        if (series.missingDays > 0) Text(tr("%d days have no shared data; they are not zero usage.", series.missingDays), color = TextMuted)
        if (series.splitMissingDays > 0) Text(tr("Some historical snapshots lack network splits; combined totals are shown for those days."), color = TextMuted)
        if (series.partialDay != null) Text(tr("The latest day is partial, as of the child's last check-in."), color = TextMuted)
        FamilyBars(series, usage)
    }
    if (selectedApp == null) {
        val request = rows.filter { it.kind == "request" }.maxByOrNull { it.updatedAt }?.payload
        val grant = rows.filter { it.kind == "grant" }.maxByOrNull { it.updatedAt }?.payload
        val asked = request?.optLong("askedBytes") ?: 0
        val at = request?.optLong("at") ?: 0
        if (asked > 0 && at > 0 && grant?.optLong("requestAt") != at) FamilyPanel {
            Text(tr("Requested %s on %s", usage.formatBytes(asked), familyDate(at)))
            Text(tr("Approving increases this child's local mobile data limit after its next sync."), color = TextMuted)
            Button(enabled = !busy, onClick = { runAction { repo.answer(child, at, asked) } }) { Text(tr("Approve request"), color = MaterialTheme.colorScheme.onPrimary) }
            OutlinedButton(enabled = !busy, onClick = { runAction { repo.answer(child, at, 0) } }) { Text(tr("Decline request")) }
        }
        FamilyChildLimit(child, rows, settings, settingsRepo, repo, state.now, busy, runAction)
        if (state.selectedNetwork != "MOBILE" && series.wifiNetworks.isNotEmpty()) FamilyPanel {
            Text(tr("Wi-Fi networks"), style = MaterialTheme.typography.titleMedium)
            series.wifiNetworks.forEach { Text("${it.ssid ?: tr("Unknown network")}: ${usage.formatBytes(it.total)}") }
        }
        Text(tr("Apps"), color = TextPrimary, style = MaterialTheme.typography.titleMedium)
        if (series.apps.isEmpty()) Text(tr("No shared usage in this range."), color = TextMuted)
        series.apps.forEach { app -> FamilyPanel(Modifier.clickable { onApp(app.uid) }) {
            Text(if (app.uid == -100) tr("Other apps") else app.name)
            Text("${usage.formatBytes(app.total)} · ↓ ${usage.formatBytes(app.download)} / ↑ ${usage.formatBytes(app.upload)}", color = TextSecondary)
        } }
    }
}

@Composable
private fun FamilyBars(series: FamilySeries, usage: UsageRepository) {
    var selected by remember(series) { mutableStateOf<FamilyDay?>(null) }
    if (series.bins.isEmpty()) { Text(tr("No shared usage in this range."), color = TextMuted); return }
    val peak = series.bins.maxOf { it.total }.coerceAtLeast(1)
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).height(110.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        series.bins.forEach { bin ->
            val description = "${DateFormat.getDateInstance().format(Date(bin.day))}: ${usage.formatBytes(bin.total)}"
            Box(Modifier.width(24.dp).fillMaxHeight().clickable { selected = bin }.semantics { contentDescription = description }, contentAlignment = Alignment.BottomCenter) {
                Box(Modifier.fillMaxWidth().height((100f * bin.total / peak).coerceAtLeast(2f).dp).background(if (selected == bin) AccentSecondary else AccentPrimary))
            }
        }
    }
    val shown = selected ?: series.bins.last()
    Text("${DateFormat.getDateInstance().format(Date(shown.day))}: ${usage.formatBytes(shown.total)} · ↓ ${usage.formatBytes(shown.download)} / ↑ ${usage.formatBytes(shown.upload)}", color = TextSecondary)
}

@Composable
private fun FamilyChildLimit(child: FamilyChild, rows: List<FamilySnapshot>, settings: AppSettings, settingsRepo: SettingsRepository,
    repo: FamilyRepository, now: Long, busy: Boolean, runAction: (suspend () -> Unit) -> Unit) {
    val usage = UsageRepository.getInstance(LocalContext.current)
    val existing = settingsRepo.readExtras().optJSONObject("childLimits")?.optJSONObject(child.id)
    var amount by remember(child.id) { mutableStateOf(existing?.optLong("mobileLimitBytes")?.takeIf { it > 0 }?.let { (it / 1_073_741_824.0).toString() } ?: "") }
    var warn by remember(child.id) { mutableStateOf((existing?.optInt("warnAtPercent", 80) ?: 80).toString()) }
    val bytes = gbBytes(amount)
    val warnValue = warn.toIntOrNull()
    FamilyPanel {
        Text(tr("Parent notification threshold"), style = MaterialTheme.typography.titleMedium)
        Text(tr("Tracks combined mobile and Wi-Fi usage for this billing cycle. This is an alert threshold, not a device block."), color = TextMuted)
        if ((existing?.optLong("mobileLimitBytes") ?: 0) > 0 && now - child.lastSeen <= 3 * 3_600_000L) {
            val cycle = RangeUtils.billingCycleRange(settings.cycleStartDay, now)
            val used = buildFamilySeries(rows, cycle.start, now, "ALL", now).total
            Text(tr("Cycle usage: %s of %s", usage.formatBytes(used), usage.formatBytes(existing!!.optLong("mobileLimitBytes"))))
        }
        OutlinedTextField(amount, { amount = it }, label = { Text(tr("Limit (GB; blank disables)")) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth(), isError = amount.isNotBlank() && bytes == null)
        OutlinedTextField(warn, { warn = it }, label = { Text(tr("Warn at percent (1–100)")) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth(), isError = (warnValue ?: 0) !in 1..100)
        OutlinedButton(enabled = !busy && (amount.isBlank() || bytes != null) && (warnValue ?: 0) in 1..100,
            onClick = { runAction { repo.setChildLimit(child.id, bytes, warnValue!!) } }) { Text(tr("Save threshold")) }
    }
}
