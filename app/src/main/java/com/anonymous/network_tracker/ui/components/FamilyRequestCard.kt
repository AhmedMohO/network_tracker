package com.anonymous.network_tracker.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.anonymous.network_tracker.data.family.FamilyRepository
import com.anonymous.network_tracker.data.repository.SettingsRepository
import com.anonymous.network_tracker.data.repository.UsageRepository
import com.anonymous.network_tracker.data.util.RangeUtils
import com.anonymous.network_tracker.ui.LaunchedOnResumeEffect
import com.anonymous.network_tracker.ui.theme.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date

@Composable
fun FamilyRequestCard(onOpenFamily: () -> Unit) {
    FamilyRequestControls(onOpenFamily, alwaysShow = false)
}

@Composable
fun FamilyRequestControls(onOpenFamily: (() -> Unit)?, alwaysShow: Boolean) {
    val context = LocalContext.current
    val settingsRepo = remember(context) { SettingsRepository.getInstance(context) }
    val usage = remember(context) { UsageRepository.getInstance(context) }
    val family = remember(context) { FamilyRepository.getInstance(context) }
    val scope = rememberCoroutineScope()
    var settings by remember { mutableStateOf(settingsRepo.loadSettings()) }
    var pendingBytes by remember { mutableLongStateOf(0) }
    var pendingAt by remember { mutableLongStateOf(0) }
    var eligible by remember { mutableStateOf(false) }
    var amount by remember { mutableStateOf("0.5") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    fun reload() {
        settings = settingsRepo.loadSettings()
        val pending = settingsRepo.readExtras().optJSONObject("pendingLimitRequest")
        pendingBytes = pending?.optLong("askedBytes") ?: 0
        pendingAt = pending?.optLong("at") ?: 0
    }
    LaunchedOnResumeEffect(context) {
        while (true) {
            try {
                reload()
                if (settings.familyRole == "child" && settings.pairToken != null) {
                    val limit = settings.mobileLimitBytes
                    eligible = if (limit != null && limit > 0) {
                        val used = usage.getUsage(RangeUtils.billingCycleRange(settings.cycleStartDay, System.currentTimeMillis()), "MOBILE").sumOf { it.total }
                        used * 100.0 / limit >= settings.mobileWarnAtPercent
                    } else false
                } else eligible = false
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { error = e.message ?: e.javaClass.simpleName }
            delay(15_000)
        }
    }
    if (settings.familyRole != "child" || settings.pairToken == null || (!alwaysShow && !eligible && pendingBytes <= 0)) return
    val rawGb = amount.toDoubleOrNull()
    val bytes = rawGb?.times(1_073_741_824.0)?.takeIf { it.isFinite() && it >= 1 && it < Long.MAX_VALUE.toDouble() }?.toLong()
    fun act(action: suspend () -> Unit) {
        if (busy) return
        busy = true; error = null
        scope.launch {
            try { action(); reload() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { error = e.message ?: e.javaClass.simpleName }
            finally { busy = false }
        }
    }
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(tr("Ask for more mobile data"), style = MaterialTheme.typography.titleMedium)
            if (error != null) Text(tr(error!!), color = DangerRed)
            if (pendingBytes > 0) {
                Text(tr("Waiting for %s to answer your %s request, sent %s.", settings.pairedLabel.orEmpty(), usage.formatBytes(pendingBytes), DateFormat.getDateTimeInstance().format(Date(pendingAt))))
                OutlinedButton(enabled = !busy, onClick = { act { family.cancelRequest() } }) { Text(tr("Cancel request")) }
                Text(tr("Cancellation needs a connection. Your request stays pending if the server cannot be reached."), color = TextMuted)
            } else {
                Text(tr("Approval raises this device's mobile data alert limit after the next sync. It does not add data to your carrier plan."), color = TextMuted)
                OutlinedTextField(amount, { amount = it }, label = { Text(tr("Requested data (GB)")) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth(), isError = bytes == null)
                Button(enabled = !busy && bytes != null, onClick = { act { family.requestMore(bytes!!) } }) {
                    Text(tr("Send request"), color = MaterialTheme.colorScheme.onPrimary)
                }
            }
            if (onOpenFamily != null) TextButton(onClick = onOpenFamily) { Text(tr("Open family sharing")) }
        }
    }
}
