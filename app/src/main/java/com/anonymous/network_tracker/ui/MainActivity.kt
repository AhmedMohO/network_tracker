package com.anonymous.network_tracker.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.style.TextOverflow
import androidx.core.content.ContextCompat
import com.anonymous.network_tracker.data.repository.SettingsRepository
import com.anonymous.network_tracker.ui.screens.*
import com.anonymous.network_tracker.ui.theme.*
import com.anonymous.network_tracker.ui.components.FamilyRequestCard
import com.anonymous.network_tracker.service.worker.UsageWork
import com.anonymous.network_tracker.service.WifiWatchService
import kotlinx.coroutines.delay
import java.util.Locale

enum class AppDestination(val title: String, val icon: ImageVector) {
    OVERVIEW("Usage", Icons.Default.Dashboard),
    COMPARE("Compare", Icons.AutoMirrored.Filled.CompareArrows),
    LIVE("Live", Icons.Default.Speed),
    PROBE("Diagnostics", Icons.Default.NetworkCheck),
    SETTINGS("Settings", Icons.Default.Settings)
}

class MainActivity : ComponentActivity() {
    private var pairingLink by mutableStateOf<String?>(null)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pairingLink = savedInstanceState?.getString("pairingLink") ?: intent?.dataString
        val initialSettings = SettingsRepository.getInstance(this).loadSettings()
        Locale.setDefault(Locale.forLanguageTag(initialSettings.language))
        enableEdgeToEdge()
        setContent {
            val repo = remember { SettingsRepository.getInstance(this) }
            var settings by remember { mutableStateOf(initialSettings) }
            LaunchedOnResumeEffect(repo) {
                settings = repo.loadSettings()
                WifiWatchService.sync(this@MainActivity)
                while (true) { UsageWork.enqueue(this@MainActivity); delay(5 * 60_000L) }
            }
            val systemDark = isSystemInDarkTheme()
            val dark = when (settings.themeMode) { "dark" -> true; "light" -> false; else -> systemDark }
            NetTrackTheme(darkTheme = dark, language = settings.language) {
                MainAppHost(pairingLink, onPairConsumed = { pairingLink = null }, onAppearanceChanged = {
                    val updated = repo.loadSettings()
                    Locale.setDefault(Locale.forLanguageTag(updated.language))
                    settings = updated
                })
            }
        }
    }
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pairingLink = intent.dataString
    }
    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("pairingLink", pairingLink)
        super.onSaveInstanceState(outState)
    }
}

@Composable
fun MainAppHost(initialPairLink: String? = null, onPairConsumed: () -> Unit = {}, onAppearanceChanged: () -> Unit = {}) {
    var currentDestination by rememberSaveable { mutableStateOf(AppDestination.OVERVIEW) }
    var selectedUidForDetail by rememberSaveable { mutableStateOf<Int?>(null) }
    var isInFamilyScreen by rememberSaveable { mutableStateOf(false) }
    var isInUpdateScreen by rememberSaveable { mutableStateOf(false) }
    val usageState = rememberUsageState()
    val context = LocalContext.current
    val asked = remember { context.getSharedPreferences("notification-permission", 0) }
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        asked.edit().putBoolean("asked", true).apply()
    }
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33 && !asked.getBoolean("asked", false) &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
    LaunchedEffect(initialPairLink) {
        if (initialPairLink != null) { isInFamilyScreen = true; selectedUidForDetail = null; isInUpdateScreen = false }
    }
    BackHandler(selectedUidForDetail != null || isInFamilyScreen || isInUpdateScreen) {
        when {
            selectedUidForDetail != null -> selectedUidForDetail = null
            isInFamilyScreen -> { isInFamilyScreen = false; onPairConsumed() }
            else -> isInUpdateScreen = false
        }
    }
    Scaffold(
        modifier = Modifier.fillMaxSize(), containerColor = DarkBackground,
        bottomBar = {
            if (selectedUidForDetail == null && !isInFamilyScreen && !isInUpdateScreen) NavigationBar(containerColor = DarkSurface, tonalElevation = 0.dp) {
                AppDestination.entries.forEach { destination ->
                    NavigationBarItem(
                        selected = currentDestination == destination,
                        onClick = { currentDestination = destination },
                        icon = { Icon(destination.icon, contentDescription = tr(destination.title)) },
                        label = { Text(tr(destination.title), fontSize = 12.sp, maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.onPrimary,
                            selectedTextColor = AccentPrimary,
                            unselectedIconColor = TextMuted, unselectedTextColor = TextMuted,
                            indicatorColor = AccentPrimary
                        )
                    )
                }
            }
        }
    ) { innerPadding ->
        val modifier = Modifier.padding(innerPadding).consumeWindowInsets(innerPadding)
        when {
            selectedUidForDetail != null -> AppDetailScreen(selectedUidForDetail!!, { selectedUidForDetail = null }, modifier, usageState = usageState)
            isInFamilyScreen -> FamilyScreen(onBack = { isInFamilyScreen = false; onPairConsumed() }, modifier = modifier, initialPairLink = initialPairLink)
            isInUpdateScreen -> UpdateScreen(onBack = { isInUpdateScreen = false }, modifier = modifier)
            else -> when (currentDestination) {
                AppDestination.OVERVIEW -> OverviewScreen(onNavigateToAppDetail = { selectedUidForDetail = it }, modifier = modifier, usageState = usageState,
                    familyRequest = { FamilyRequestCard { isInFamilyScreen = true } })
                AppDestination.COMPARE -> CompareScreen(modifier = modifier, usageState = usageState)
                AppDestination.LIVE -> LiveScreen(modifier = modifier)
                AppDestination.PROBE -> ProbeScreen(modifier = modifier)
                AppDestination.SETTINGS -> SettingsScreen(onNavigateToFamily = { isInFamilyScreen = true }, onNavigateToUpdate = { isInUpdateScreen = true }, modifier = modifier, usageState = usageState, onAppearanceChanged = onAppearanceChanged)
            }
        }
    }
}
