package com.anonymous.network_tracker.ui.screens

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anonymous.network_tracker.data.family.*
import com.anonymous.network_tracker.data.model.AppUsageItem
import com.anonymous.network_tracker.data.repository.*
import com.anonymous.network_tracker.data.util.RangeUtils
import com.anonymous.network_tracker.ui.LaunchedOnResumeEffect
import com.anonymous.network_tracker.ui.UsageState
import com.anonymous.network_tracker.ui.components.*
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
private fun familyDay(at: Long): String = DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(at))
private fun familyTime(at: Long): String = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(at))

private fun formatRelativeSpan(at: Long, now: Long = System.currentTimeMillis()): String {
    val diff = (now - at).coerceAtLeast(0)
    val mins = diff / 60_000L
    if (mins < 1) return "just now"
    if (mins < 60) return "${mins}m ago"
    val hours = mins / 60
    if (hours < 24) return "${hours}h ago"
    val days = hours / 24
    return "${days}d ago"
}

private fun gbBytes(raw: String): Long? {
    val gb = raw.toDoubleOrNull() ?: return null
    return (gb * 1_073_741_824.0).takeIf { it.isFinite() && it >= 0.01 && it < Long.MAX_VALUE.toDouble() }?.toLong()
}

@Composable
fun FamilyScreen(onBack: () -> Unit, modifier: Modifier = Modifier, initialPairLink: String? = null) {
    val context = LocalContext.current
    val settingsRepo = remember(context) { SettingsRepository.getInstance(context) }
    val repo = remember(context) { FamilyRepository.getInstance(context) }
    val usageRepo = remember(context) { UsageRepository.getInstance(context) }
    val scope = rememberCoroutineScope()

    var settings by remember { mutableStateOf(settingsRepo.loadSettings()) }
    var rows by remember { mutableStateOf<List<FamilySnapshot>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var pairingDialog by remember { mutableStateOf<Pairing?>(null) }
    var showQrDialog by remember { mutableStateOf(false) }
    var showUnpairDialog by remember { mutableStateOf(false) }
    var selectedChildId by remember { mutableStateOf<String?>(null) }
    var selectedAppUid by remember { mutableStateOf<Int?>(null) }

    val usageState = rememberUsageState()

    suspend fun reload() {
        settings = settingsRepo.loadSettings()
        rows = repo.readCache()
    }

    fun runAction(action: suspend () -> Unit) {
        if (busy) return
        busy = true
        error = null
        scope.launch {
            try {
                action()
                reload()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = e.message ?: e.javaClass.simpleName
            } finally {
                busy = false
            }
        }
    }

    fun previewPairLink(raw: String) {
        val parsed = parsePairLink(raw)
        if (parsed == null) {
            error = "Invalid pairing link. Paste the complete nettrack://pair link."
        } else if (settings.pairToken != null && settings.pairToken != parsed.token) {
            error = "Unpair from your current family first."
        } else {
            pairingDialog = parsed
            error = null
        }
    }

    LaunchedEffect(initialPairLink) {
        if (initialPairLink != null) previewPairLink(initialPairLink)
    }

    LaunchedOnResumeEffect(context) {
        try { reload() } catch (e: CancellationException) { throw e } catch (e: Exception) { error = e.message }
        while (true) {
            delay(15_000)
            try { reload() } catch (e: CancellationException) { throw e } catch (e: Exception) { error = e.message }
        }
    }

    BackHandler(selectedChildId != null) {
        if (selectedAppUid != null) {
            selectedAppUid = null
        } else {
            selectedChildId = null
        }
    }

    val childSummaryList = remember(rows, settings.cycleStartDay, settingsRepo.readExtras()) {
        val limits = settingsRepo.readExtras().optJSONObject("childLimits")
        familyChildren(rows).map { c ->
            summarizeChildDevice(c.id, rows, settings.cycleStartDay, limits?.optJSONObject(c.id))
        }
    }

    val selectedChild = childSummaryList.firstOrNull { it.deviceId == selectedChildId }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = DarkBackground
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when {
                selectedChild != null && selectedAppUid != null -> {
                    FamilyChildAppDetailView(
                        child = selectedChild,
                        uid = selectedAppUid!!,
                        rows = rows.filter { it.deviceId == selectedChild.deviceId },
                        settings = settings,
                        usage = usageRepo,
                        state = usageState,
                        onBack = { selectedAppUid = null }
                    )
                }
                selectedChild != null -> {
                    FamilyChildDetailView(
                        summary = selectedChild,
                        childRows = rows.filter { it.deviceId == selectedChild.deviceId },
                        settings = settings,
                        settingsRepo = settingsRepo,
                        repo = repo,
                        usage = usageRepo,
                        state = usageState,
                        busy = busy,
                        onAppSelect = { selectedAppUid = it },
                        onBack = { selectedChildId = null },
                        runAction = { runAction(it) }
                    )
                }
                settings.pairToken == null -> {
                    FamilyUnpairedView(
                        settings = settings,
                        busy = busy,
                        error = error,
                        onBack = onBack,
                        onCreateParent = { lbl -> runAction { repo.becomeParent(lbl) } },
                        onReviewLink = { previewPairLink(it) },
                        onScanQr = {
                            val activity = context.activity()
                            if (activity == null) {
                                error = "Scanner is unavailable. Paste the pairing link instead."
                            } else {
                                try {
                                    GmsBarcodeScanning.getClient(activity).startScan()
                                        .addOnSuccessListener { code -> previewPairLink(code.rawValue.orEmpty()) }
                                        .addOnFailureListener { error = it.message ?: "Scanner is unavailable." }
                                } catch (e: Exception) {
                                    error = e.message
                                }
                            }
                        }
                    )
                }
                settings.familyRole == "child" -> {
                    FamilyChildRoleView(
                        settings = settings,
                        settingsRepo = settingsRepo,
                        repo = repo,
                        usage = usageRepo,
                        busy = busy,
                        error = error,
                        onBack = onBack,
                        onUnpairRequest = { showUnpairDialog = true },
                        runAction = { runAction(it) }
                    )
                }
                else -> {
                    FamilyParentDashboardView(
                        settings = settings,
                        settingsRepo = settingsRepo,
                        repo = repo,
                        usage = usageRepo,
                        children = childSummaryList,
                        busy = busy,
                        error = error,
                        onBack = onBack,
                        onChildSelect = { selectedChildId = it.deviceId; selectedAppUid = null },
                        onShowQr = { showQrDialog = true },
                        onUnpairRequest = { showUnpairDialog = true },
                        runAction = { runAction(it) }
                    )
                }
            }
        }
    }

    pairingDialog?.let { candidate ->
        AlertDialog(
            onDismissRequest = { if (!busy) pairingDialog = null },
            title = { Text(tr("Join Family of %s?", candidate.label.ifBlank { "Parent" })) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(tr("As a family member, your daily data usage, live active app name, battery level, and Wi-Fi network names will be shared with %s.", candidate.label.ifBlank { "the parent" }))
                    Text(tr("Messages, browsing history, files, and location are NEVER shared."), color = TextMuted)
                }
            },
            confirmButton = {
                Button(
                    enabled = !busy,
                    onClick = {
                        runAction {
                            repo.join(candidate)
                            pairingDialog = null
                            repo.sync()
                        }
                    }
                ) { Text(tr("Agree and Join")) }
            },
            dismissButton = {
                TextButton(enabled = !busy, onClick = { pairingDialog = null }) { Text(tr("Cancel")) }
            }
        )
    }

    if (showQrDialog && settings.pairToken != null) {
        val link = pairLink(settings.pairToken!!, settings.deviceLabel ?: Build.MODEL)
        AlertDialog(
            onDismissRequest = { showQrDialog = false },
            title = { Text(tr("Family Pairing QR")) },
            text = {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    FamilyQrCodeImage(link)
                    Text(
                        tr("Scan this code from a child device to pair it with your family."),
                        color = TextMuted,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    clipboard.setPrimaryClip(ClipData.newPlainText("Pairing link", link))
                    Toast.makeText(context, "Link copied to clipboard", Toast.LENGTH_SHORT).show()
                }) { Text(tr("Copy Link")) }
            },
            dismissButton = {
                TextButton(onClick = { showQrDialog = false }) { Text(tr("Close")) }
            }
        )
    }

    if (showUnpairDialog) {
        AlertDialog(
            onDismissRequest = { if (!busy) showUnpairDialog = false },
            title = { Text(tr("Unpair Family?")) },
            text = {
                Text(tr("This removes shared family snapshots from the server for paired devices. Your local usage records remain safely on this device. An active internet connection is required."))
            },
            confirmButton = {
                Button(
                    enabled = !busy,
                    colors = ButtonDefaults.buttonColors(containerColor = DangerRed),
                    onClick = {
                        runAction {
                            repo.unpair()
                            showUnpairDialog = false
                            selectedChildId = null
                            selectedAppUid = null
                        }
                    }
                ) { Text(tr("Unpair Now")) }
            },
            dismissButton = {
                TextButton(enabled = !busy, onClick = { showUnpairDialog = false }) { Text(tr("Cancel")) }
            }
        )
    }
}

// -------------------------------------------------------------------------------------------------
// 1. PARENT DASHBOARD VIEW
// -------------------------------------------------------------------------------------------------

@Composable
private fun FamilyParentDashboardView(
    settings: AppSettings,
    settingsRepo: SettingsRepository,
    repo: FamilyRepository,
    usage: UsageRepository,
    children: List<ChildDeviceSummary>,
    busy: Boolean,
    error: String?,
    onBack: () -> Unit,
    onChildSelect: (ChildDeviceSummary) -> Unit,
    onShowQr: () -> Unit,
    onUnpairRequest: () -> Unit,
    runAction: (suspend () -> Unit) -> Unit
) {
    val context = LocalContext.current
    var labelText by remember(settings.deviceLabel) { mutableStateOf(settings.deviceLabel ?: Build.MODEL) }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Top App Bar
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, tr("Back"), tint = TextPrimary)
                }
                Text(tr("Family Sharing"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = TextPrimary)
            }
            IconButton(enabled = !busy, onClick = { runAction { repo.sync() } }) {
                Icon(Icons.Default.Sync, tr("Sync now"), tint = if (busy) AccentSecondary else AccentPrimary)
            }
        }

        if (busy) LinearProgressIndicator(Modifier.fillMaxWidth(), color = AccentPrimary)
        if (error != null) Text(tr(error), color = DangerRed, style = MaterialTheme.typography.bodyMedium)

        // Sync Broken Warning
        if (settings.lastSyncErrorAt != null) {
            Card(
                Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                border = BorderStroke(1.dp, DangerRed.copy(alpha = 0.6f))
            ) {
                Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = DangerRed)
                    Column(Modifier.weight(1f)) {
                        Text(tr("Family sync interrupted"), style = MaterialTheme.typography.titleSmall, color = DangerRed, fontWeight = FontWeight.SemiBold)
                        Text(tr("Sync has failed since %s. Cached device data is shown.", familyDate(settings.lastSyncErrorAt!!)), color = TextMuted, style = MaterialTheme.typography.bodySmall)
                    }
                    TextButton(enabled = !busy, onClick = { runAction { repo.sync() } }) {
                        Text(tr("Retry"), color = AccentPrimary)
                    }
                }
            }
        }

        // Family Group Summary Card
        Card(
            Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(
                        Modifier.size(42.dp).clip(CircleShape).background(AccentPrimary.copy(alpha = 0.15f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Group, contentDescription = null, tint = AccentPrimary)
                    }
                    Column(Modifier.weight(1f)) {
                        Text(settings.deviceLabel ?: Build.MODEL, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = TextPrimary)
                        Text(
                            tr("Last sync: %s", settings.lastSyncOkAt?.let(::familyDate) ?: tr("Never")),
                            color = TextMuted,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }

                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        modifier = Modifier.weight(1f),
                        onClick = {
                            if (settings.pairToken != null) {
                                val link = pairLink(settings.pairToken!!, settings.deviceLabel ?: Build.MODEL)
                                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_TEXT, link)
                                }
                                context.startActivity(Intent.createChooser(shareIntent, context.getString(android.R.string.paste)))
                            }
                        }
                    ) {
                        Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(tr("Share Link"))
                    }

                    OutlinedButton(
                        modifier = Modifier.weight(1f),
                        onClick = onShowQr
                    ) {
                        Icon(Icons.Default.QrCode, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(tr("Show QR"))
                    }
                }
            }
        }

        // Children Section
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(tr("Paired Devices (%d)", children.size), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = TextPrimary)
            Text(tr("Real-time updates"), color = TextMuted, style = MaterialTheme.typography.bodySmall)
        }

        if (children.isEmpty()) {
            Card(
                Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                shape = RoundedCornerShape(16.dp)
            ) {
                Column(
                    Modifier.padding(24.dp).fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Icon(Icons.Default.PhoneAndroid, contentDescription = null, tint = TextMuted, modifier = Modifier.size(48.dp))
                    Text(tr("No devices connected yet"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = TextPrimary)
                    Text(
                        tr("Share your pairing link or show the QR code to pair child devices."),
                        color = TextMuted,
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }
        } else {
            children.forEach { child ->
                ParentChildCard(
                    child = child,
                    usage = usage,
                    busy = busy,
                    onClick = { onChildSelect(child) },
                    onGrant = { at, bytes -> runAction { repo.answer(FamilyChild(child.deviceId, child.label, child.lastSeen), at, bytes) } }
                )
            }
        }

        // Settings / Label editing
        Card(
            Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(tr("Parent Device Label"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = TextPrimary)
                OutlinedTextField(
                    value = labelText,
                    onValueChange = { labelText = it },
                    label = { Text(tr("Device name visible to family")) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                if (labelText.trim() != (settings.deviceLabel ?: Build.MODEL)) {
                    Button(
                        enabled = !busy && labelText.isNotBlank(),
                        onClick = { runAction { settingsRepo.update { it.copy(deviceLabel = labelText.trim()) } } }
                    ) { Text(tr("Save Label")) }
                }
            }
        }

        OutlinedButton(
            enabled = !busy,
            onClick = onUnpairRequest,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = DangerRed)
        ) {
            Icon(Icons.Default.DeleteOutline, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(8.dp))
            Text(tr("Unpair All Devices and Delete Family"))
        }
    }
}

@Composable
private fun ParentChildCard(
    child: ChildDeviceSummary,
    usage: UsageRepository,
    busy: Boolean,
    onClick: () -> Unit,
    onGrant: (Long, Long) -> Unit
) {
    Card(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = DarkSurface),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            // Header Row: Device Label + Status Chip + Chevron
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Box(
                        Modifier.size(38.dp).clip(CircleShape).background(AccentSecondary.copy(alpha = 0.15f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.PhoneAndroid, contentDescription = null, tint = AccentSecondary)
                    }
                    Column {
                        Text(child.label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = TextPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            if (child.lastSeen > 0) tr("Last seen: %s", formatRelativeSpan(child.lastSeen)) else tr("Never checked in"),
                            style = MaterialTheme.typography.bodySmall,
                            color = TextMuted
                        )
                    }
                }

                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    val statusText = when {
                        child.lastSeen <= 0 -> tr("Offline")
                        System.currentTimeMillis() - child.lastSeen <= 15 * 60_000L -> tr("Active")
                        child.isStale -> tr("Offline")
                        else -> formatRelativeSpan(child.lastSeen)
                    }
                    val statusColor = when {
                        child.lastSeen <= 0 -> DangerRed
                        System.currentTimeMillis() - child.lastSeen <= 15 * 60_000L -> AccentPrimary
                        child.isStale -> DangerRed
                        else -> AccentSecondary
                    }
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(statusColor.copy(alpha = 0.15f))
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(statusText, color = statusColor, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    }
                    Icon(Icons.Default.ChevronRight, contentDescription = null, tint = TextMuted)
                }
            }

            // Live Context Badge Row (Battery, Connection, Active App)
            child.contextInfo?.let { ctx ->
                if (!ctx.isStale) {
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        ctx.batteryPercent?.let { bat ->
                            ContextChip(icon = Icons.Default.BatteryChargingFull, text = "$bat%")
                        }
                        ctx.connection?.let { conn ->
                            val icon = if (conn.contains("WIFI", ignoreCase = true)) Icons.Default.Wifi else Icons.Default.SignalCellularAlt
                            ContextChip(icon = icon, text = conn)
                        }
                        ctx.foregroundAppName?.let { app ->
                            ContextChip(icon = Icons.Default.PlayArrow, text = tr("Using %s", app))
                        }
                    }
                }
            }

            // Today's Usage Row
            child.todayTotals?.let { tt ->
                if (tt.isToday) {
                    Card(
                        Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = DarkSurfaceVariant),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Row(
                            Modifier.padding(horizontal = 12.dp, vertical = 8.dp).fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.PhoneAndroid, contentDescription = null, modifier = Modifier.size(13.dp), tint = TextSecondary)
                                    Text(usage.formatBytes(tt.mobile), style = MaterialTheme.typography.bodySmall, color = TextPrimary, fontWeight = FontWeight.SemiBold)
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Wifi, contentDescription = null, modifier = Modifier.size(13.dp), tint = TextSecondary)
                                    Text(usage.formatBytes(tt.wifi), style = MaterialTheme.typography.bodySmall, color = TextPrimary, fontWeight = FontWeight.SemiBold)
                                }
                            }
                            Text(tr("Today: %s", usage.formatBytes(tt.total)), style = MaterialTheme.typography.bodySmall, color = AccentPrimary, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            // Pending Data Request Alert Banner
            child.pendingRequest?.let { req ->
                if (req.isPending) {
                    Card(
                        Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = AccentPrimary.copy(alpha = 0.12f)),
                        border = BorderStroke(1.dp, AccentPrimary.copy(alpha = 0.5f)),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Icon(Icons.Default.NotificationsActive, contentDescription = null, tint = AccentPrimary, modifier = Modifier.size(16.dp))
                                Text(tr("Asking for +%s data", usage.formatBytes(req.askedBytes)), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, color = TextPrimary)
                            }
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(
                                    modifier = Modifier.weight(1f).height(36.dp),
                                    enabled = !busy,
                                    onClick = { onGrant(req.requestAt, req.askedBytes) },
                                    colors = ButtonDefaults.buttonColors(containerColor = AccentPrimary)
                                ) { Text(tr("Grant"), fontSize = 12.sp) }

                                OutlinedButton(
                                    modifier = Modifier.weight(1f).height(36.dp),
                                    enabled = !busy,
                                    onClick = { onGrant(req.requestAt, 0) }
                                ) { Text(tr("Decline"), fontSize = 12.sp) }
                            }
                        }
                    }
                }
            }

            // Cycle Limit Progress Bar
            child.cycleLimitBytes?.let { limit ->
                val used = child.cycleUsedBytes ?: 0L
                val progress = if (limit > 0) (used.toFloat() / limit).coerceIn(0f, 1f) else 0f
                val percent = if (limit > 0) ((used * 100) / limit).toInt() else 0
                val progressColor = when {
                    percent >= 100 -> DangerRed
                    percent >= (child.cycleWarnPercent ?: 80) -> AccentSecondary
                    else -> AccentPrimary
                }

                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(tr("Billing cycle"), style = MaterialTheme.typography.labelSmall, color = TextMuted)
                        Text("${usage.formatBytes(used)} / ${usage.formatBytes(limit)} ($percent%)", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = progressColor)
                    }
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                        color = progressColor,
                        trackColor = DarkSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun ContextChip(icon: ImageVector, text: String) {
    Row(
        Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(DarkSurfaceVariant)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(13.dp), tint = TextSecondary)
        Text(text, style = MaterialTheme.typography.labelSmall, color = TextSecondary, maxLines = 1)
    }
}

// -------------------------------------------------------------------------------------------------
// 2. CHILD DEVICE DETAIL VIEW (For Parent)
// -------------------------------------------------------------------------------------------------

@Composable
private fun FamilyChildDetailView(
    summary: ChildDeviceSummary,
    childRows: List<FamilySnapshot>,
    settings: AppSettings,
    settingsRepo: SettingsRepository,
    repo: FamilyRepository,
    usage: UsageRepository,
    state: UsageState,
    busy: Boolean,
    onAppSelect: (Int) -> Unit,
    onBack: () -> Unit,
    runAction: (suspend () -> Unit) -> Unit
) {
    val range = state.activeRange(settings.cycleStartDay)
    val series = remember(childRows, range, state.selectedNetwork) {
        buildFamilySeries(childRows, range.start, range.end, state.selectedNetwork, state.now)
    }
    val stale = state.now - summary.lastSeen > 3 * 3_600_000L

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Navigation Header
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, tr("Back"), tint = TextPrimary)
                }
                Column {
                    Text(summary.label, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = TextPrimary)
                    Text(
                        if (summary.lastSeen > 0) tr("Last check-in: %s", familyDate(summary.lastSeen)) else tr("Never checked in"),
                        color = TextMuted,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
            IconButton(enabled = !busy, onClick = { runAction { repo.sync() } }) {
                Icon(Icons.Default.Sync, tr("Sync now"), tint = AccentPrimary)
            }
        }

        if (stale) {
            Card(
                Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                border = BorderStroke(1.dp, DangerRed.copy(alpha = 0.6f))
            ) {
                Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = DangerRed)
                    Text(tr("Stale data. Usage and context reflect the last check-in (%s), not current activity.", formatRelativeSpan(summary.lastSeen)), color = DangerRed, style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        // Live Device Context Card
        summary.contextInfo?.let { ctx ->
            Card(
                Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                shape = RoundedCornerShape(16.dp)
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(tr("Device Context (as of %s)", familyTime(ctx.capturedAt)), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = TextPrimary)
                    if (ctx.isStale) {
                        Text(tr("Device context is unavailable until the child's next check-in."), color = TextMuted, style = MaterialTheme.typography.bodySmall)
                    } else {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            ctx.batteryPercent?.let { bat ->
                                ContextChip(icon = Icons.Default.BatteryFull, text = "$bat% Battery")
                            }
                            ctx.connection?.let { conn ->
                                ContextChip(icon = Icons.Default.Wifi, text = conn)
                            }
                            ctx.foregroundAppName?.let { app ->
                                ContextChip(icon = Icons.Default.PlayArrow, text = tr("App: %s", app))
                            }
                        }
                    }
                    summary.todayTotals?.let { tt ->
                        if (tt.coverageStart != null && tt.coverageEnd != null) {
                            Text(tr("Reported coverage: %s – %s", familyTime(tt.coverageStart), familyTime(tt.coverageEnd)), color = TextMuted, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
        }

        // Range Picker & Network Filters
        UsageRangePicker(state, settings.cycleStartDay)

        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("ALL" to "All networks", "MOBILE" to "Mobile", "WIFI" to "Wi-Fi").forEach { (net, label) ->
                FilterChip(
                    selected = state.selectedNetwork == net,
                    onClick = { state.selectedNetwork = net },
                    label = { Text(tr(label)) }
                )
            }
        }

        // Total Usage Card
        Card(
            Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(tr("Reported Usage"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = TextPrimary)
                Text(usage.formatBytes(series.total), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = TextPrimary)

                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Card(Modifier.weight(1f), colors = CardDefaults.cardColors(containerColor = DarkSurfaceVariant)) {
                        Row(Modifier.padding(10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.ArrowDownward, contentDescription = null, tint = AccentPrimary, modifier = Modifier.size(16.dp))
                            Column {
                                Text(tr("Download"), style = MaterialTheme.typography.labelSmall, color = TextMuted)
                                Text(usage.formatBytes(series.bins.sumOf { it.download }), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                    Card(Modifier.weight(1f), colors = CardDefaults.cardColors(containerColor = DarkSurfaceVariant)) {
                        Row(Modifier.padding(10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.ArrowUpward, contentDescription = null, tint = AccentSecondary, modifier = Modifier.size(16.dp))
                            Column {
                                Text(tr("Upload"), style = MaterialTheme.typography.labelSmall, color = TextMuted)
                                Text(usage.formatBytes(series.bins.sumOf { it.upload }), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                if (series.mobile != null && series.wifi != null) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(tr("Mobile: %s · Wi-Fi: %s", usage.formatBytes(series.mobile), usage.formatBytes(series.wifi)), color = TextSecondary, style = MaterialTheme.typography.bodySmall)
                    }
                }

                if (series.partialDay != null) Text(tr("The latest day is partial, as of the child's last check-in."), color = TextMuted, style = MaterialTheme.typography.labelSmall)
                if (series.missingDays > 0) Text(tr("%d days have no shared data; they are not zero usage.", series.missingDays), color = TextMuted, style = MaterialTheme.typography.labelSmall)
                if (series.splitMissingDays > 0) Text(tr("Some historical snapshots lack network splits; combined totals are shown for those days."), color = TextMuted, style = MaterialTheme.typography.labelSmall)

                // Interactive Daily Chart
                FamilyBars(series, usage)
            }
        }

        // Pending Request Action Card
        val req = summary.pendingRequest
        if (req != null && req.isPending) {
            Card(
                Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                border = BorderStroke(1.dp, AccentPrimary),
                shape = RoundedCornerShape(16.dp)
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Default.NotificationsActive, contentDescription = null, tint = AccentPrimary)
                        Text(tr("Data Request Pending"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = TextPrimary)
                    }
                    Text(
                        tr("Requested %s on %s. Approving increases this child's local mobile data limit after its next sync.", usage.formatBytes(req.askedBytes), familyDate(req.requestAt)),
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(
                            modifier = Modifier.weight(1f),
                            enabled = !busy,
                            onClick = { runAction { repo.answer(FamilyChild(summary.deviceId, summary.label, summary.lastSeen), req.requestAt, req.askedBytes) } }
                        ) { Text(tr("Approve Request")) }

                        OutlinedButton(
                            modifier = Modifier.weight(1f),
                            enabled = !busy,
                            onClick = { runAction { repo.answer(FamilyChild(summary.deviceId, summary.label, summary.lastSeen), req.requestAt, 0) } }
                        ) { Text(tr("Decline")) }
                    }
                }
            }
        }

        // Child Quota Configuration Card
        FamilyChildLimitCard(
            summary = summary,
            childRows = childRows,
            settings = settings,
            settingsRepo = settingsRepo,
            repo = repo,
            usage = usage,
            busy = busy,
            runAction = runAction
        )

        // Wi-Fi Networks Breakdown
        if (state.selectedNetwork != "MOBILE" && series.wifiNetworks.isNotEmpty()) {
            Card(
                Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                shape = RoundedCornerShape(16.dp)
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(tr("Wi-Fi Networks (%d)", series.wifiNetworks.size), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = TextPrimary)
                    val wifiPeak = series.wifiNetworks.maxOf { it.total }.coerceAtLeast(1L)
                    series.wifiNetworks.forEach { net ->
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(net.ssid ?: tr("Unknown Wi-Fi"), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = TextPrimary)
                                Text(usage.formatBytes(net.total), style = MaterialTheme.typography.bodyMedium, color = AccentPrimary)
                            }
                            LinearProgressIndicator(
                                progress = { (net.total.toFloat() / wifiPeak).coerceIn(0f, 1f) },
                                modifier = Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)),
                                color = AccentPrimary,
                                trackColor = DarkSurfaceVariant
                            )
                        }
                    }
                }
            }
        }

        // Apps List
        Text(tr("Apps (%d)", series.apps.size), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = TextPrimary)
        if (series.apps.isEmpty()) {
            Text(tr("No shared usage in this range."), color = TextMuted)
        } else {
            series.apps.forEach { app ->
                Card(
                    Modifier
                        .fillMaxWidth()
                        .clickable(enabled = app.uid >= 0) { onAppSelect(app.uid) },
                    colors = CardDefaults.cardColors(containerColor = DarkSurface),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        AppIconImage(packageName = app.packageName, appName = app.name, size = 42.dp)
                        Column(Modifier.weight(1f)) {
                            Text(if (app.uid == -100) tr("Other apps") else app.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = TextPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                "↓ ${usage.formatBytes(app.download)} / ↑ ${usage.formatBytes(app.upload)}",
                                style = MaterialTheme.typography.labelSmall,
                                color = TextMuted
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(usage.formatBytes(app.total), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = TextPrimary)
                            Text(String.format("%.1f%%", app.percentage), style = MaterialTheme.typography.labelSmall, color = AccentSecondary)
                        }
                        if (app.uid >= 0) {
                            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(18.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FamilyChildLimitCard(
    summary: ChildDeviceSummary,
    childRows: List<FamilySnapshot>,
    settings: AppSettings,
    settingsRepo: SettingsRepository,
    repo: FamilyRepository,
    usage: UsageRepository,
    busy: Boolean,
    runAction: (suspend () -> Unit) -> Unit
) {
    val existing = settingsRepo.readExtras().optJSONObject("childLimits")?.optJSONObject(summary.deviceId)
    var amountGb by remember(summary.deviceId) {
        mutableStateOf(existing?.optLong("mobileLimitBytes")?.takeIf { it > 0 }?.let { (it / 1_073_741_824.0).toString() } ?: "")
    }
    var warnPercent by remember(summary.deviceId) {
        mutableStateOf((existing?.optInt("warnAtPercent", 80) ?: 80).toString())
    }
    val bytes = gbBytes(amountGb)
    val warnVal = warnPercent.toIntOrNull()

    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = DarkSurface),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(tr("Parent Notification Threshold"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = TextPrimary)
            Text(
                tr("Tracks combined mobile and Wi-Fi usage for this billing cycle. This is an alert threshold, not a device block."),
                color = TextMuted,
                style = MaterialTheme.typography.bodySmall
            )

            if ((existing?.optLong("mobileLimitBytes") ?: 0) > 0) {
                val cycle = RangeUtils.billingCycleRange(settings.cycleStartDay, System.currentTimeMillis())
                val used = buildFamilySeries(childRows, cycle.start, System.currentTimeMillis(), "ALL").total
                val limit = existing!!.optLong("mobileLimitBytes")
                val pct = ((used * 100) / limit).toInt()
                Text(
                    tr("Cycle usage: %s of %s (%d%%)", usage.formatBytes(used), usage.formatBytes(limit), pct),
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = if (pct >= 100) DangerRed else AccentPrimary
                )
            }

            OutlinedTextField(
                value = amountGb,
                onValueChange = { amountGb = it },
                label = { Text(tr("Limit (GB; blank disables)")) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                isError = amountGb.isNotBlank() && bytes == null
            )

            OutlinedTextField(
                value = warnPercent,
                onValueChange = { warnPercent = it },
                label = { Text(tr("Warn at percent (1–100)")) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                isError = (warnVal ?: 0) !in 1..100
            )

            OutlinedButton(
                enabled = !busy && (amountGb.isBlank() || bytes != null) && (warnVal ?: 0) in 1..100,
                onClick = { runAction { repo.setChildLimit(summary.deviceId, bytes, warnVal!!) } },
                modifier = Modifier.fillMaxWidth()
            ) { Text(tr("Save Threshold")) }
        }
    }
}

// -------------------------------------------------------------------------------------------------
// 3. CHILD APP DETAIL VIEW
// -------------------------------------------------------------------------------------------------

@Composable
private fun FamilyChildAppDetailView(
    child: ChildDeviceSummary,
    uid: Int,
    rows: List<FamilySnapshot>,
    settings: AppSettings,
    usage: UsageRepository,
    state: UsageState,
    onBack: () -> Unit
) {
    val range = state.activeRange(settings.cycleStartDay)
    val appSeries = remember(rows, uid, range) {
        buildChildAppSeries(rows, uid, range.start, range.end)
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, tr("Back"), tint = TextPrimary)
            }
            Text(tr("%s's Apps", child.label), style = MaterialTheme.typography.titleMedium, color = TextMuted)
        }

        // App Identity Header Card
        Card(
            Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(16.dp)
        ) {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                AppIconImage(packageName = appSeries.packageName, appName = appSeries.appName, size = 56.dp)
                Column {
                    Text(appSeries.appName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = TextPrimary)
                    if (appSeries.packageName != null) {
                        Text(appSeries.packageName, style = MaterialTheme.typography.bodySmall, color = TextMuted)
                    }
                }
            }
        }

        UsageRangePicker(state, settings.cycleStartDay)

        // App Totals Card
        Card(
            Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(tr("App Total Usage"), style = MaterialTheme.typography.titleSmall, color = TextMuted)
                Text(usage.formatBytes(appSeries.total), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = TextPrimary)

                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Card(Modifier.weight(1f), colors = CardDefaults.cardColors(containerColor = DarkSurfaceVariant)) {
                        Row(Modifier.padding(10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.ArrowDownward, contentDescription = null, tint = AccentPrimary, modifier = Modifier.size(16.dp))
                            Column {
                                Text(tr("Download"), style = MaterialTheme.typography.labelSmall, color = TextMuted)
                                Text(usage.formatBytes(appSeries.download), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                    Card(Modifier.weight(1f), colors = CardDefaults.cardColors(containerColor = DarkSurfaceVariant)) {
                        Row(Modifier.padding(10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.ArrowUpward, contentDescription = null, tint = AccentSecondary, modifier = Modifier.size(16.dp))
                            Column {
                                Text(tr("Upload"), style = MaterialTheme.typography.labelSmall, color = TextMuted)
                                Text(usage.formatBytes(appSeries.upload), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                // Daily App Chart
                ChildAppBars(bins = appSeries.bins, usage = usage)
            }
        }

        // Daily Breakdown List
        Text(tr("Daily Breakdown (%d days)", appSeries.bins.size), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = TextPrimary)
        if (appSeries.bins.isEmpty()) {
            Text(tr("No usage recorded for this app in the selected period."), color = TextMuted)
        } else {
            appSeries.bins.reversed().forEach { bin ->
                Card(
                    Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = DarkSurface),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        Modifier.padding(12.dp).fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(familyDay(bin.day), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = TextPrimary)
                            Text("↓ ${usage.formatBytes(bin.download)} / ↑ ${usage.formatBytes(bin.upload)}", style = MaterialTheme.typography.labelSmall, color = TextMuted)
                        }
                        Text(usage.formatBytes(bin.total), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = AccentPrimary)
                    }
                }
            }
        }
    }
}

@Composable
private fun ChildAppBars(bins: List<ChildAppDay>, usage: UsageRepository) {
    var selected by remember(bins) { mutableStateOf<ChildAppDay?>(null) }
    if (bins.isEmpty()) return
    val peak = bins.maxOf { it.total }.coerceAtLeast(1)
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = DarkSurfaceVariant)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).height(110.dp),
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                bins.forEach { bin ->
                    val description = "${familyDay(bin.day)}: ${usage.formatBytes(bin.total)}"
                    Box(
                        Modifier.width(26.dp).fillMaxHeight().clickable { selected = bin }.semantics { contentDescription = description },
                        contentAlignment = Alignment.BottomCenter
                    ) {
                        Box(
                            Modifier.fillMaxWidth()
                                .height((100f * bin.total / peak).coerceAtLeast(3f).dp)
                                .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp))
                                .background(if (selected == bin) AccentSecondary else AccentPrimary)
                        )
                    }
                }
            }
            val shown = selected ?: bins.last()
            Text(
                "${familyDay(shown.day)}: ${usage.formatBytes(shown.total)} · ↓ ${usage.formatBytes(shown.download)} / ↑ ${usage.formatBytes(shown.upload)}",
                color = TextSecondary,
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

// -------------------------------------------------------------------------------------------------
// 4. CHILD ROLE VIEW (When this device is child)
// -------------------------------------------------------------------------------------------------

@Composable
private fun FamilyChildRoleView(
    settings: AppSettings,
    settingsRepo: SettingsRepository,
    repo: FamilyRepository,
    usage: UsageRepository,
    busy: Boolean,
    error: String?,
    onBack: () -> Unit,
    onUnpairRequest: () -> Unit,
    runAction: (suspend () -> Unit) -> Unit
) {
    var askAmountGb by remember { mutableStateOf("1.0") }
    var cycleUsedMobile by remember { mutableLongStateOf(0L) }
    val pending = settingsRepo.readExtras().optJSONObject("pendingLimitRequest")
    val pendingBytes = pending?.optLong("askedBytes") ?: 0L
    val pendingAt = pending?.optLong("at") ?: 0L

    LaunchedEffect(settings.cycleStartDay, settings.mobileLimitBytes) {
        val cycle = RangeUtils.billingCycleRange(settings.cycleStartDay, System.currentTimeMillis())
        cycleUsedMobile = usage.getUsage(cycle, "MOBILE").sumOf { it.total }
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, tr("Back"), tint = TextPrimary)
                }
                Text(tr("Family Member"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = TextPrimary)
            }
            IconButton(enabled = !busy, onClick = { runAction { repo.sync() } }) {
                Icon(Icons.Default.Sync, tr("Sync now"), tint = AccentPrimary)
            }
        }

        if (busy) LinearProgressIndicator(Modifier.fillMaxWidth(), color = AccentPrimary)
        if (error != null) Text(tr(error), color = DangerRed)

        // Status Card
        Card(
            Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(42.dp).clip(CircleShape).background(AccentPrimary.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Link, contentDescription = null, tint = AccentPrimary)
                    }
                    Column {
                        Text(tr("Sharing with %s", settings.pairedLabel.orEmpty().ifBlank { "Parent" }), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = TextPrimary)
                        Text(tr("Last synced: %s", settings.lastSyncOkAt?.let(::familyDate) ?: tr("Never")), style = MaterialTheme.typography.bodySmall, color = TextMuted)
                    }
                }
            }
        }

        // Mobile Limit Card
        Card(
            Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(tr("Mobile Data Limit"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = TextPrimary)
                val limit = settings.mobileLimitBytes
                if (limit != null && limit > 0) {
                    val used = cycleUsedMobile
                    val pct = ((used * 100) / limit).toInt()
                    Text(tr("Current limit: %s", usage.formatBytes(limit)), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = TextPrimary)
                    LinearProgressIndicator(
                        progress = { (used.toFloat() / limit).coerceIn(0f, 1f) },
                        modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)),
                        color = if (pct >= 100) DangerRed else AccentPrimary,
                        trackColor = DarkSurfaceVariant
                    )
                    Text(tr("%s of %s used (%d%%)", usage.formatBytes(used), usage.formatBytes(limit), pct), style = MaterialTheme.typography.bodySmall, color = TextMuted)
                } else {
                    Text(tr("No mobile limit set"), style = MaterialTheme.typography.bodyMedium, color = TextMuted)
                }
            }
        }

        // Ask for More Data Card
        Card(
            Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(tr("Ask for Extra Data"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = TextPrimary)

                if (pendingBytes > 0) {
                    Card(
                        Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = AccentPrimary.copy(alpha = 0.12f)),
                        border = BorderStroke(1.dp, AccentPrimary.copy(alpha = 0.5f))
                    ) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                tr("Waiting for %s to answer your request for %s, sent %s.", settings.pairedLabel.orEmpty().ifBlank { "Parent" }, usage.formatBytes(pendingBytes), familyDate(pendingAt)),
                                style = MaterialTheme.typography.bodySmall,
                                color = TextPrimary
                            )
                            OutlinedButton(
                                enabled = !busy,
                                onClick = { runAction { repo.cancelRequest() } },
                                modifier = Modifier.fillMaxWidth()
                            ) { Text(tr("Cancel Request")) }
                        }
                    }
                } else {
                    Text(tr("Approval raises this device's local mobile data alert limit after the next sync."), color = TextMuted, style = MaterialTheme.typography.bodySmall)

                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("0.5" to "+500 MB", "1.0" to "+1 GB", "2.0" to "+2 GB", "5.0" to "+5 GB").forEach { (gb, label) ->
                            FilterChip(
                                selected = askAmountGb == gb,
                                onClick = { askAmountGb = gb },
                                label = { Text(label) }
                            )
                        }
                    }

                    OutlinedTextField(
                        value = askAmountGb,
                        onValueChange = { askAmountGb = it },
                        label = { Text(tr("Requested data (GB)")) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )

                    val reqBytes = gbBytes(askAmountGb)
                    Button(
                        enabled = !busy && reqBytes != null,
                        onClick = { runAction { repo.requestMore(reqBytes!!) } },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(tr("Send Request to Parent"))
                    }
                }
            }
        }

        // Privacy Card
        FamilyPrivacyCard()

        OutlinedButton(
            enabled = !busy,
            onClick = onUnpairRequest,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = DangerRed)
        ) {
            Icon(Icons.Default.DeleteOutline, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(8.dp))
            Text(tr("Stop Sharing and Unpair"))
        }
    }
}

// -------------------------------------------------------------------------------------------------
// 5. UNPAIRED ONBOARDING VIEW
// -------------------------------------------------------------------------------------------------

@Composable
private fun FamilyUnpairedView(
    settings: AppSettings,
    busy: Boolean,
    error: String?,
    onBack: () -> Unit,
    onCreateParent: (String) -> Unit,
    onReviewLink: (String) -> Unit,
    onScanQr: () -> Unit
) {
    var tabIndex by remember { mutableIntStateOf(0) }
    var parentLabel by remember { mutableStateOf(settings.deviceLabel ?: Build.MODEL) }
    var pasteLink by remember { mutableStateOf("") }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, tr("Back"), tint = TextPrimary)
            }
            Text(tr("Family Sharing"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = TextPrimary)
        }

        if (busy) LinearProgressIndicator(Modifier.fillMaxWidth(), color = AccentPrimary)
        if (error != null) Text(tr(error), color = DangerRed)

        TabRow(
            selectedTabIndex = tabIndex,
            containerColor = DarkSurface,
            contentColor = AccentPrimary
        ) {
            Tab(selected = tabIndex == 0, onClick = { tabIndex = 0 }, text = { Text(tr("Parent Setup")) })
            Tab(selected = tabIndex == 1, onClick = { tabIndex = 1 }, text = { Text(tr("Join as Child")) })
        }

        if (tabIndex == 0) {
            Card(
                Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                shape = RoundedCornerShape(16.dp)
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(tr("Create a Family as Parent"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = TextPrimary)
                    Text(
                        tr("As a parent device, you will be able to monitor connected devices' data usage, check live active apps & battery levels, configure alert quotas, and grant extra data."),
                        color = TextMuted,
                        style = MaterialTheme.typography.bodySmall
                    )
                    OutlinedTextField(
                        value = parentLabel,
                        onValueChange = { parentLabel = it },
                        label = { Text(tr("Parent device label")) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    Button(
                        enabled = !busy && parentLabel.isNotBlank(),
                        onClick = { onCreateParent(parentLabel.trim()) },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text(tr("Create Family Group")) }
                }
            }
        } else {
            Card(
                Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                shape = RoundedCornerShape(16.dp)
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(tr("Join Family as Child"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = TextPrimary)
                    Text(
                        tr("Scan the QR code displayed on the parent's screen or paste the invite link to connect."),
                        color = TextMuted,
                        style = MaterialTheme.typography.bodySmall
                    )
                    Button(
                        enabled = !busy,
                        onClick = onScanQr,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.QrCodeScanner, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(tr("Scan Pairing QR"))
                    }

                    OutlinedTextField(
                        value = pasteLink,
                        onValueChange = { pasteLink = it },
                        label = { Text(tr("Or paste pairing link (nettrack://pair...)")) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )

                    OutlinedButton(
                        enabled = !busy && pasteLink.isNotBlank(),
                        onClick = { onReviewLink(pasteLink.trim()) },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text(tr("Review and Join")) }
                }
            }
        }

        FamilyPrivacyCard()
    }
}

// -------------------------------------------------------------------------------------------------
// REUSABLE COMPONENTS
// -------------------------------------------------------------------------------------------------

@Composable
private fun FamilyPrivacyCard() {
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = DarkSurface),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(tr("Privacy & Data Protection"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = TextPrimary)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                Icon(Icons.Default.Check, contentDescription = null, tint = AccentPrimary, modifier = Modifier.size(16.dp))
                Text(tr("Shares daily & recent data usage totals, active app name, battery percent, and Wi-Fi network names (if enabled)."), color = TextSecondary, style = MaterialTheme.typography.bodySmall)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                Icon(Icons.Default.Lock, contentDescription = null, tint = AccentSecondary, modifier = Modifier.size(16.dp))
                Text(tr("Messages, browsing history, files, and location are NEVER shared or transmitted."), color = TextSecondary, style = MaterialTheme.typography.bodySmall)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                Icon(Icons.Default.Security, contentDescription = null, tint = TextMuted, modifier = Modifier.size(16.dp))
                Text(tr("You can disconnect and stop sharing at any time from this screen."), color = TextMuted, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun FamilyBars(series: FamilySeries, usage: UsageRepository) {
    var selected by remember(series) { mutableStateOf<FamilyDay?>(null) }
    if (series.bins.isEmpty()) {
        Text(tr("No shared usage in this range."), color = TextMuted)
        return
    }
    val peak = series.bins.maxOf { it.total }.coerceAtLeast(1)
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = DarkSurfaceVariant)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).height(110.dp),
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                series.bins.forEach { bin ->
                    val description = "${familyDay(bin.day)}: ${usage.formatBytes(bin.total)}"
                    Box(
                        Modifier.width(26.dp).fillMaxHeight().clickable { selected = bin }.semantics { contentDescription = description },
                        contentAlignment = Alignment.BottomCenter
                    ) {
                        Box(
                            Modifier.fillMaxWidth()
                                .height((100f * bin.total / peak).coerceAtLeast(3f).dp)
                                .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp))
                                .background(if (selected == bin) AccentSecondary else AccentPrimary)
                        )
                    }
                }
            }
            val shown = selected ?: series.bins.last()
            Text(
                "${familyDay(shown.day)}: ${usage.formatBytes(shown.total)} · ↓ ${usage.formatBytes(shown.download)} / ↑ ${usage.formatBytes(shown.upload)}",
                color = TextSecondary,
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

@Composable
private fun FamilyQrCodeImage(link: String) {
    val qr = remember(link) {
        runCatching {
            val matrix = MultiFormatWriter().encode(link, BarcodeFormat.QR_CODE, 640, 640)
            Bitmap.createBitmap(640, 640, Bitmap.Config.ARGB_8888).apply {
                setPixels(
                    IntArray(640 * 640) { i -> if (matrix[i % 640, i / 640]) android.graphics.Color.BLACK else android.graphics.Color.WHITE },
                    0, 640, 0, 0, 640, 640
                )
            }.asImageBitmap()
        }
    }
    qr.getOrNull()?.let {
        Image(
            bitmap = it,
            contentDescription = tr("Family pairing QR code"),
            modifier = Modifier.size(240.dp).clip(RoundedCornerShape(12.dp)).background(Color.White)
        )
    } ?: Text(tr("Unable to create QR code. Share the pairing link instead."), color = DangerRed)
}
