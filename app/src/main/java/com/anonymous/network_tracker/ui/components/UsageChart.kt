package com.anonymous.network_tracker.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.anonymous.network_tracker.data.model.SeriesPoint
import com.anonymous.network_tracker.data.repository.UsageRepository
import com.anonymous.network_tracker.data.util.DateRange
import com.anonymous.network_tracker.ui.theme.*
import kotlinx.coroutines.CancellationException
import java.text.DateFormat
import java.util.Date

@Composable
fun UsageError(message: String?, onRetry: () -> Unit) {
    if (message != null) {
        Column(Modifier.fillMaxWidth().padding(12.dp)) {
            Text(tr(message), color = DangerRed)
            TextButton(onClick = onRetry) { Text(tr("Try again")) }
        }
    }
}

@Composable
fun UsageChart(range: DateRange, network: String, uid: Int? = null, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val repo = remember(context) { UsageRepository.getInstance(context) }
    var points by remember { mutableStateOf<List<SeriesPoint>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var retry by remember { mutableIntStateOf(0) }
    var selected by remember(range, network, uid) { mutableStateOf<SeriesPoint?>(null) }
    LaunchedEffect(range, network, uid, retry) {
        points = emptyList()
        error = null
        loading = true
        try { points = repo.getSeries(range, network, uid) }
        catch (e: CancellationException) { throw e }
        catch (e: Exception) { error = e.message ?: e.javaClass.simpleName }
        finally { loading = false }
    }
    Card(modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = DarkSurface)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(tr("Usage over time"), color = TextPrimary)
            if (loading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            UsageError(error) { retry++ }
            if (!loading && error == null) {
                if (points.isEmpty()) Text(tr("No usage in this range."), color = TextMuted)
                else {
                    val peak = points.maxOf { it.rxBytes + it.txBytes }.coerceAtLeast(1)
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).height(130.dp),
                        verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                        points.forEach { point ->
                            val text = "${DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(point.start))}: ${repo.formatBytes(point.rxBytes + point.txBytes)}"
                            Box(Modifier.width(18.dp).fillMaxHeight().clickable { selected = point }.semantics { contentDescription = text }, contentAlignment = Alignment.BottomCenter) {
                                Box(Modifier.fillMaxWidth().height((120f * (point.rxBytes + point.txBytes) / peak).coerceAtLeast(2f).dp)
                                    .background(if (selected == point) AccentSecondary else AccentPrimary))
                            }
                        }
                    }
                    val shown = selected ?: points.maxByOrNull { it.rxBytes + it.txBytes }
                    if (shown != null) Text(
                        "${DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(shown.start))} – ${DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(shown.end))}: ↓ ${repo.formatBytes(shown.rxBytes)} / ↑ ${repo.formatBytes(shown.txBytes)}",
                        color = TextSecondary, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

