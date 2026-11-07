package com.anonymous.network_tracker.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.anonymous.network_tracker.ui.theme.*

@Composable
fun WifiLimitNetworkPicker(
    selectedSsid: String?,
    networks: List<String>,
    trackingEnabled: Boolean,
    onSelect: (String?) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }
    val names = remember(networks, selectedSsid) {
        (networks + listOfNotNull(selectedSsid)).filter(String::isNotBlank).distinct().sorted()
    }
    val label = tr("Wi-Fi limit network")
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = TextSecondary)
        Box {
            OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()
                .heightIn(min = 48.dp).semantics { contentDescription = label }) {
                Text(selectedSsid ?: tr("All Wi-Fi networks"), modifier = Modifier.weight(1f),
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                Icon(Icons.Default.ExpandMore, contentDescription = null)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false },
                modifier = Modifier.heightIn(max = 320.dp)) {
                DropdownMenuItem(text = { Text(tr("All Wi-Fi networks")) },
                    onClick = { expanded = false; onSelect(null) },
                    trailingIcon = { if (selectedSsid == null) Icon(Icons.Default.Check, contentDescription = null) })
                if (names.isNotEmpty()) HorizontalDivider()
                names.forEach { ssid ->
                    DropdownMenuItem(text = { Text(ssid, maxLines = 2, overflow = TextOverflow.Ellipsis) },
                        onClick = { expanded = false; onSelect(ssid) },
                        trailingIcon = { if (ssid == selectedSsid) Icon(Icons.Default.Check, contentDescription = null) })
                }
                if (names.isEmpty()) DropdownMenuItem(enabled = false, onClick = {},
                    text = { Text(tr("No Wi-Fi networks recorded yet")) })
            }
        }
        if (selectedSsid != null) Text(tr("Only attributed usage for this network is counted."),
            color = TextMuted, style = MaterialTheme.typography.bodySmall)
        if (!trackingEnabled && (selectedSsid != null || names.isEmpty())) {
            Text(tr("Enable Wi-Fi Network Attribution in Settings for network-specific usage."),
                color = WarningAmber, style = MaterialTheme.typography.bodySmall)
        }
    }
}
