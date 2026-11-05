package com.anonymous.network_tracker.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anonymous.network_tracker.core.ApkInstaller
import com.anonymous.network_tracker.core.VersionUtils
import com.anonymous.network_tracker.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

data class GithubRelease(
    val tagName: String,
    val name: String,
    val body: String,
    val apkUrl: String?,
    val apkSize: Long,
    val htmlUrl: String
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UpdateScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val client = remember {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .build()
    }

    val currentVersion = remember {
        try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            pInfo.versionName ?: "2.0.0"
        } catch (_: Exception) {
            "2.0.0"
        }
    }

    var isLoading by remember { mutableStateOf(true) }
    var release by remember { mutableStateOf<GithubRelease?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var errorArgs by remember { mutableStateOf<List<Any?>>(emptyList()) }

    var isDownloading by remember { mutableStateOf(false) }
    var downloadProgress by remember { mutableFloatStateOf(0f) }
    var downloadStatusText by remember { mutableStateOf("") }
    var downloadArgs by remember { mutableStateOf<List<Any?>>(emptyList()) }

    LaunchedEffect(Unit) {
        withContext(Dispatchers.IO) {
            try {
                val req = Request.Builder()
                    .url("https://api.github.com/repos/AhmedMohO/network_tracker/releases/latest")
                    .header("Accept", "application/vnd.github+json")
                    .header("User-Agent", "NetTrack-Android-Native")
                    .build()
                client.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) {
                        errorMessage = "Failed to fetch updates (HTTP %d)"
                        errorArgs = listOf(resp.code)
                        isLoading = false
                        return@use
                    }
                    val bodyStr = resp.body?.string() ?: ""
                    val json = JSONObject(bodyStr)
                    val assets = json.optJSONArray("assets")
                    var apkUrl: String? = null
                    var apkSize: Long = 0
                    if (assets != null) {
                        for (i in 0 until assets.length()) {
                            val asset = assets.getJSONObject(i)
                            val name = asset.optString("name", "")
                            if (name.endsWith(".apk")) {
                                apkUrl = asset.optString("browser_download_url")
                                apkSize = asset.optLong("size", 0)
                                break
                            }
                        }
                    }

                    release = GithubRelease(
                        tagName = json.optString("tag_name", ""),
                        name = json.optString("name", json.optString("tag_name")),
                        body = json.optString("body", ""),
                        apkUrl = apkUrl,
                        apkSize = apkSize,
                        htmlUrl = json.optString("html_url", "https://github.com/AhmedMohO/network_tracker/releases")
                    )
                }
            } catch (e: Exception) {
                errorMessage = e.localizedMessage ?: "Unable to connect to GitHub"
            } finally {
                isLoading = false
            }
        }
    }

    fun startDownloadAndInstall(targetRelease: GithubRelease) {
        val url = targetRelease.apkUrl ?: return
        if (!ApkInstaller.canInstall(context)) {
            ApkInstaller.openPermissionSettings(context)
            return
        }

        isDownloading = true
        downloadProgress = 0f
        downloadStatusText = "Connecting..."
        downloadArgs = emptyList()

        scope.launch(Dispatchers.IO) {
            try {
                val destFile = File(context.cacheDir, "update.apk")
                if (destFile.exists()) destFile.delete()

                val request = Request.Builder().url(url).build()
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) throw IllegalStateException("Download failed: ${response.code}")
                    val body = response.body ?: throw IllegalStateException("Empty response body")
                    val totalBytes = body.contentLength().takeIf { it > 0 } ?: targetRelease.apkSize

                    body.byteStream().use { input ->
                        FileOutputStream(destFile).use { output ->
                            val buffer = ByteArray(8 * 1024)
                            var read: Int
                            var downloaded: Long = 0
                            while (input.read(buffer).also { read = it } != -1) {
                                output.write(buffer, 0, read)
                                downloaded += read
                                if (totalBytes > 0) {
                                    val progress = downloaded.toFloat() / totalBytes.toFloat()
                                    withContext(Dispatchers.Main) {
                                        downloadProgress = progress
                                        downloadStatusText = "Downloading: %.1f / %.1f MB (%.0f%%)"
                                        downloadArgs = listOf(
                                            downloaded / 1_048_576.0,
                                            totalBytes / 1_048_576.0,
                                            progress * 100f
                                        )
                                    }
                                }
                            }
                            output.flush()
                        }
                    }
                }

                withContext(Dispatchers.Main) {
                    isDownloading = false
                    downloadStatusText = "Installing update..."
                    downloadArgs = emptyList()
                    ApkInstaller.install(context, destFile.absolutePath)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    isDownloading = false
                    errorMessage = "Download error: %s"
                    errorArgs = listOf(e.message ?: e.javaClass.simpleName)
                }
            }
        }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = DarkBackground,
        topBar = {
            TopAppBar(
                title = { Text(tr("App Updates"), color = TextPrimary, fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = tr("Back"), tint = TextPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = DarkSurface)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Current Version Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(18.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(AccentPrimary.copy(alpha = 0.15f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Download, contentDescription = null, tint = AccentPrimary)
                    }
                    Spacer(modifier = Modifier.width(14.dp))
                    Column {
                        Text(tr("Installed Version"), color = TextMuted, fontSize = 12.sp)
                        Text("v$currentVersion", color = TextPrimary, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            when {
                isLoading -> {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(40.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator(color = AccentPrimary)
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(tr("Checking for updates..."), color = TextMuted, fontSize = 14.sp)
                        }
                    }
                }
                errorMessage != null -> {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = DarkSurface)
                    ) {
                        Column(modifier = Modifier.padding(18.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Warning, contentDescription = null, tint = AccentSecondary)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(tr("Check Failed"), color = AccentSecondary, fontWeight = FontWeight.Bold)
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(tr(errorMessage!!, *errorArgs.toTypedArray()), color = TextMuted, fontSize = 13.sp)
                        }
                    }
                }
                release != null -> {
                    val rel = release!!
                    val hasUpdate = VersionUtils.isNewerVersion(rel.tagName, currentVersion) && rel.apkUrl != null

                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = DarkSurface)
                    ) {
                        Column(modifier = Modifier.padding(18.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        text = if (hasUpdate) tr("Update Available") else tr("You're up to date!"),
                                        color = if (hasUpdate) AccentPrimary else TextPrimary,
                                        fontSize = 17.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(tr("Latest: %s", rel.tagName), color = TextSecondary, fontSize = 13.sp)
                                }
                                if (hasUpdate) {
                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = AccentPrimary.copy(alpha = 0.2f)
                                    ) {
                                        Text(
                                            tr("NEW"),
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                            color = AccentPrimary,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }

                            if (rel.body.isNotBlank()) {
                                Spacer(modifier = Modifier.height(14.dp))
                                Text(tr("Release Notes"), color = TextPrimary, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(
                                    text = rel.body.trim(),
                                    color = TextMuted,
                                    fontSize = 13.sp,
                                    lineHeight = 18.sp
                                )
                            }

                            if (isDownloading) {
                                Spacer(modifier = Modifier.height(16.dp))
                                LinearProgressIndicator(
                                    progress = { downloadProgress },
                                    modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)),
                                    color = AccentPrimary,
                                    trackColor = DarkSurfaceVariant
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(tr(downloadStatusText, *downloadArgs.toTypedArray()), color = TextMuted, fontSize = 12.sp)
                            } else if (hasUpdate) {
                                Spacer(modifier = Modifier.height(18.dp))
                                Button(
                                    onClick = { startDownloadAndInstall(rel) },
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = ButtonDefaults.buttonColors(containerColor = AccentPrimary),
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Icon(Icons.Default.Download, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = tr("Download & Install (%.1f MB)", rel.apkSize / 1_048_576.0),
                                        color = MaterialTheme.colorScheme.onPrimary,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(8.dp))
                            OutlinedButton(
                                onClick = {
                                    val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(rel.htmlUrl))
                                    context.startActivity(browserIntent)
                                },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Icon(Icons.Default.OpenInBrowser, contentDescription = null, tint = AccentSecondary)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(tr("View on GitHub"), color = AccentSecondary)
                            }
                        }
                    }
                }
            }
        }
    }
}
