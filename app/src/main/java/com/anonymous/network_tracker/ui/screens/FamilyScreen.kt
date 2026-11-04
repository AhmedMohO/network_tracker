package com.anonymous.network_tracker.ui.screens

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.DeviceHub
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anonymous.network_tracker.data.api.SupabaseRpc
import com.anonymous.network_tracker.data.repository.SettingsRepository
import com.anonymous.network_tracker.ui.theme.*
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.launch

@Composable
fun FamilyScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val settingsRepo = remember(context) { SettingsRepository.getInstance(context) }
    val scope = rememberCoroutineScope()
    var settings by remember { mutableStateOf(settingsRepo.loadSettings()) }
    var isSyncing by remember { mutableStateOf(false) }

    val scanner = remember { GmsBarcodeScanning.getClient(context) }

    fun startScan() {
        scanner.startScan()
            .addOnSuccessListener { barcode ->
                val code = barcode.rawValue
                if (!code.isNullOrEmpty()) {
                    Toast.makeText(context, "Pairing token scanned: ${code.take(8)}...", Toast.LENGTH_SHORT).show()
                    val updated = settings.copy(pairToken = code, familyRole = "child")
                    settingsRepo.updateSettings(updated)
                    settings = updated
                }
            }
            .addOnFailureListener { e ->
                Toast.makeText(context, "Scan cancelled or failed: ${e.message}", Toast.LENGTH_SHORT).show()
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
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.Default.ArrowBack,
                        contentDescription = "Back",
                        tint = TextPrimary
                    )
                }
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Family Sharing & Sync",
                    color = TextPrimary,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            // Status Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface)
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(AccentPrimary.copy(alpha = 0.15f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.DeviceHub, contentDescription = null, tint = AccentPrimary)
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            val roleText = when (settings.familyRole) {
                                "parent" -> "Parent Device"
                                "child" -> "Child Device"
                                else -> "Not Paired"
                            }
                            Text(roleText, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                            val subtext = if (settings.pairedLabel != null) {
                                "Linked with: ${settings.pairedLabel}"
                            } else if (settings.pairToken != null) {
                                "Token: ${settings.pairToken?.take(12)}…"
                            } else {
                                "Pair with family members to synchronize quotas"
                            }
                            Text(subtext, color = TextMuted, fontSize = 12.sp)
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Button(
                            onClick = { startScan() },
                            colors = ButtonDefaults.buttonColors(containerColor = AccentPrimary),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                imageVector = Icons.Default.QrCodeScanner,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Scan QR")
                        }

                        Button(
                            onClick = {
                                val token = settings.pairToken
                                if (token == null) {
                                    Toast.makeText(context, "No pair token set. Scan a pairing QR first.", Toast.LENGTH_SHORT).show()
                                    return@Button
                                }
                                isSyncing = true
                                scope.launch {
                                    try {
                                        SupabaseRpc.familyPull(token, 0)
                                        val updated = settings.copy(lastSyncOkAt = System.currentTimeMillis())
                                        settingsRepo.updateSettings(updated)
                                        settings = updated
                                        Toast.makeText(context, "Family sync completed", Toast.LENGTH_SHORT).show()
                                    } catch (e: Exception) {
                                        Toast.makeText(context, "Sync: ${e.message}", Toast.LENGTH_SHORT).show()
                                    } finally {
                                        isSyncing = false
                                    }
                                }
                            },
                            enabled = !isSyncing,
                            colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceVariant),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Sync,
                                contentDescription = null,
                                tint = AccentSecondary,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Sync Now", color = AccentSecondary)
                        }
                    }
                }
            }
        }
    }
}
