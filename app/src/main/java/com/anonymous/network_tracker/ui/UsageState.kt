package com.anonymous.network_tracker.ui

import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.CoroutineScope
import com.anonymous.network_tracker.data.util.*
import kotlinx.coroutines.delay

@Stable
class UsageState(preset: PresetId = PresetId.TODAY, network: String = "MOBILE", custom: DateRange? = null) {
    var selectedPreset by mutableStateOf(preset)
    var selectedNetwork by mutableStateOf(network)
    var customRange by mutableStateOf(custom)
    var now by mutableLongStateOf(System.currentTimeMillis())
        private set

    fun refresh() { now = maxOf(System.currentTimeMillis(), now + 1) }
    fun activeRange(cycleDay: Int): DateRange =
        if (selectedPreset == PresetId.CUSTOM && customRange != null) customRange!!
        else RangeUtils.presetRange(selectedPreset, now, cycleDay)

    companion object {
        val Saver = listSaver<UsageState, Any>(
            save = { listOf(it.selectedPreset.name, it.selectedNetwork, it.customRange?.start ?: -1L, it.customRange?.end ?: -1L) },
            restore = {
                val start = it[2] as Long
                UsageState(PresetId.valueOf(it[0] as String), it[1] as String,
                    if (start >= 0) DateRange(start, it[3] as Long) else null)
            }
        )
    }
}

@Composable
fun LaunchedOnResumeEffect(vararg keys: Any?, block: suspend CoroutineScope.() -> Unit) {
    val owner = LocalLifecycleOwner.current
    val latest by rememberUpdatedState(block)
    // Pause/resume events can happen without a Compose frame in between.
    LaunchedEffect(owner, *keys) {
        owner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) { latest() }
    }
}

@Composable
fun rememberUsageState(): UsageState {
    val state = rememberSaveable(saver = UsageState.Saver) { UsageState() }
    LaunchedOnResumeEffect(state) {
        while (true) { state.refresh(); delay(60_000) }
    }
    return state
}
