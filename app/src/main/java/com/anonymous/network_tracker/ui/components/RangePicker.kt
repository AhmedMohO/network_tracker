package com.anonymous.network_tracker.ui.components

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.anonymous.network_tracker.data.util.*
import com.anonymous.network_tracker.ui.UsageState
import com.anonymous.network_tracker.ui.theme.*
import java.text.DateFormat
import java.util.Calendar
import java.util.Date

@Composable
fun UsageRangePicker(state: UsageState, cycleDay: Int) {
    val context = LocalContext.current
    val range = state.activeRange(cycleDay)
    var customOpen by remember { mutableStateOf(false) }
    var draftStart by remember { mutableLongStateOf(range.start) }
    var draftEnd by remember { mutableLongStateOf(range.end) }
    fun pick(initial: Long, done: (Long) -> Unit) {
        val cal = Calendar.getInstance().apply { timeInMillis = initial }
        DatePickerDialog(context, { _, year, month, day ->
            val chosen = Calendar.getInstance().apply { timeInMillis = initial; set(year, month, day) }
            TimePickerDialog(context, { _, hour, minute ->
                chosen.set(Calendar.HOUR_OF_DAY, hour)
                chosen.set(Calendar.MINUTE, minute)
                chosen.set(Calendar.SECOND, 0)
                chosen.set(Calendar.MILLISECOND, 0)
                done(chosen.timeInMillis)
            }, cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE), true).show()
        }, cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH)).apply {
            datePicker.maxDate = System.currentTimeMillis()
        }.show()
    }
    val labels = mapOf(
        PresetId.TODAY to tr("Today"), PresetId.YESTERDAY to tr("Yesterday"),
        PresetId.LAST_24H to tr("24 Hours"), PresetId.LAST_7D to tr("7 Days"),
        PresetId.LAST_30D to tr("30 Days"), PresetId.THIS_CYCLE to tr("This Cycle (Day %d)", cycleDay),
        PresetId.LAST_CYCLE to tr("Last Cycle"), PresetId.CUSTOM to tr("Custom range"))
    LazyRow(Modifier.fillMaxWidth(), contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(PresetId.values().toList()) { preset ->
            FilterChip(selected = state.selectedPreset == preset, onClick = {
                if (preset == PresetId.CUSTOM) {
                    draftStart = range.start
                    draftEnd = range.end
                    customOpen = true
                } else { state.selectedPreset = preset; state.refresh() }
            }, label = { Text(labels.getValue(preset)) })
        }
    }
    Text("${DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(range.start))} – ${DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(range.end))}",
        Modifier.padding(horizontal = 20.dp, vertical = 4.dp), color = TextMuted, style = MaterialTheme.typography.bodySmall)
    if (customOpen) {
        val problem = customRangeProblem(draftStart, draftEnd, System.currentTimeMillis())
        AlertDialog(onDismissRequest = { customOpen = false }, title = { Text(tr("Custom range")) }, text = {
            Column {
                TextButton(onClick = { pick(draftStart) { draftStart = it } }) {
                    Text(tr("From") + ": " + DateFormat.getDateTimeInstance().format(Date(draftStart)))
                }
                TextButton(onClick = { pick(draftEnd) { draftEnd = it } }) {
                    Text(tr("To") + ": " + DateFormat.getDateTimeInstance().format(Date(draftEnd)))
                }
                if (problem != null) Text(tr(problem), color = DangerRed)
            }
        }, confirmButton = {
            TextButton(enabled = problem == null, onClick = {
                // Recheck at application time as well as while drawing the dialog.
                if (customRangeProblem(draftStart, draftEnd, System.currentTimeMillis()) == null) {
                    state.customRange = DateRange(draftStart, draftEnd, PresetId.CUSTOM)
                    state.selectedPreset = PresetId.CUSTOM
                    state.refresh()
                    customOpen = false
                }
            }) { Text(tr("Apply")) }
        }, dismissButton = { TextButton(onClick = { customOpen = false }) { Text(tr("Cancel")) } })
    }
}
