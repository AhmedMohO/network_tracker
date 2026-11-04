package com.anonymous.network_tracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anonymous.network_tracker.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket

data class ProbeTarget(
    val name: String,
    val host: String,
    val port: Int = 80
)

data class ProbeResult(
    val name: String,
    val host: String,
    val isReachable: Boolean,
    val latencyMs: Long,
    val resolvedIp: String? = null
)

@Composable
fun ProbeScreen(modifier: Modifier = Modifier) {
    val scope = rememberCoroutineScope()
    var isRunning by remember { mutableStateOf(false) }
    var results by remember { mutableStateOf<List<ProbeResult>>(emptyList()) }

    val defaultTargets = remember {
        listOf(
            ProbeTarget("Cloudflare DNS", "1.1.1.1", 53),
            ProbeTarget("Google DNS", "8.8.8.8", 53),
            ProbeTarget("Google Web", "www.google.com", 443),
            ProbeTarget("Cloudflare Web", "www.cloudflare.com", 443),
            ProbeTarget("Supabase Sync", "nrnvjidwgverzmumttjd.supabase.co", 443)
        )
    }

    fun runProbes() {
        if (isRunning) return
        isRunning = true
        scope.launch {
            val list = mutableListOf<ProbeResult>()
            for (target in defaultTargets) {
                val res = withContext(Dispatchers.IO) {
                    val start = System.currentTimeMillis()
                    try {
                        val inetAddress = InetAddress.getByName(target.host)
                        val socket = Socket()
                        socket.connect(InetSocketAddress(inetAddress, target.port), 3000)
                        val latency = System.currentTimeMillis() - start
                        socket.close()
                        ProbeResult(target.name, target.host, true, latency, inetAddress.hostAddress)
                    } catch (_: Exception) {
                        val latency = System.currentTimeMillis() - start
                        ProbeResult(target.name, target.host, false, latency, null)
                    }
                }
                list.add(res)
                results = list.toList()
            }
            isRunning = false
        }
    }

    LaunchedEffect(Unit) {
        runProbes()
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
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Diagnostics Probe",
                        color = TextPrimary,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Latency & reachability test",
                        color = TextSecondary,
                        fontSize = 14.sp
                    )
                }

                Button(
                    onClick = { runProbes() },
                    enabled = !isRunning,
                    colors = ButtonDefaults.buttonColors(containerColor = AccentPrimary),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = "Run",
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Probe")
                }
            }

            if (isRunning && results.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = AccentPrimary)
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(results) { res ->
                        ProbeResultCard(result = res)
                    }
                }
            }
        }
    }
}

@Composable
fun ProbeResultCard(result: ProbeResult) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = DarkSurface)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = result.name,
                    color = TextPrimary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = result.resolvedIp ?: result.host,
                    color = TextMuted,
                    fontSize = 12.sp
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = if (result.isReachable) "${result.latencyMs} ms" else "Timeout",
                    color = if (result.isReachable) SuccessGreen else DangerRed,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.width(8.dp))
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = if (result.isReachable) SuccessGreen else DangerRed,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}

