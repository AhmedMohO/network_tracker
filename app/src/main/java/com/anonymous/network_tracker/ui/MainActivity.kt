package com.anonymous.network_tracker.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CompareArrows
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.NetworkCheck
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.anonymous.network_tracker.ui.screens.*
import com.anonymous.network_tracker.ui.theme.AccentPrimary
import com.anonymous.network_tracker.ui.theme.DarkBackground
import com.anonymous.network_tracker.ui.theme.DarkBorder
import com.anonymous.network_tracker.ui.theme.DarkSurface
import com.anonymous.network_tracker.ui.theme.NetTrackTheme
import com.anonymous.network_tracker.ui.theme.TextMuted
import com.anonymous.network_tracker.ui.theme.TextPrimary

enum class AppDestination(val title: String, val icon: ImageVector) {
    OVERVIEW("Overview", Icons.Default.Dashboard),
    LIVE("Live", Icons.Default.Speed),
    PROBE("Probe", Icons.Default.NetworkCheck),
    COMPARE("Compare", Icons.Default.CompareArrows),
    SETTINGS("Settings", Icons.Default.Settings)
}

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            NetTrackTheme {
                MainAppHost()
            }
        }
    }
}

@Composable
fun MainAppHost() {
    var currentDestination by remember { mutableStateOf(AppDestination.OVERVIEW) }
    var selectedUidForDetail by remember { mutableStateOf<Int?>(null) }
    var isInFamilyScreen by remember { mutableStateOf(false) }
    var isInUpdateScreen by remember { mutableStateOf(false) }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = DarkBackground,
        bottomBar = {
            if (selectedUidForDetail == null && !isInFamilyScreen && !isInUpdateScreen) {
                NavigationBar(
                    containerColor = DarkSurface,
                    tonalElevation = 8.dp
                ) {
                    AppDestination.values().forEach { destination ->
                        val isSelected = currentDestination == destination
                        NavigationBarItem(
                            selected = isSelected,
                            onClick = { currentDestination = destination },
                            icon = {
                                Icon(
                                    imageVector = destination.icon,
                                    contentDescription = destination.title
                                )
                            },
                            label = { Text(destination.title) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = TextPrimary,
                                selectedTextColor = AccentPrimary,
                                unselectedIconColor = TextMuted,
                                unselectedTextColor = TextMuted,
                                indicatorColor = AccentPrimary
                            )
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        val modifier = Modifier.padding(innerPadding)

        when {
            selectedUidForDetail != null -> {
                AppDetailScreen(
                    uid = selectedUidForDetail!!,
                    onBack = { selectedUidForDetail = null },
                    modifier = modifier
                )
            }
            isInFamilyScreen -> {
                FamilyScreen(
                    onBack = { isInFamilyScreen = false },
                    modifier = modifier
                )
            }
            isInUpdateScreen -> {
                UpdateScreen(
                    onBack = { isInUpdateScreen = false },
                    modifier = modifier
                )
            }
            else -> {
                when (currentDestination) {
                    AppDestination.OVERVIEW -> {
                        OverviewScreen(
                            onNavigateToAppDetail = { uid -> selectedUidForDetail = uid },
                            modifier = modifier
                        )
                    }
                    AppDestination.LIVE -> {
                        LiveScreen(modifier = modifier)
                    }
                    AppDestination.PROBE -> {
                        ProbeScreen(modifier = modifier)
                    }
                    AppDestination.COMPARE -> {
                        CompareScreen(modifier = modifier)
                    }
                    AppDestination.SETTINGS -> {
                        SettingsScreen(
                            onNavigateToFamily = { isInFamilyScreen = true },
                            onNavigateToUpdate = { isInUpdateScreen = true },
                            modifier = modifier
                        )
                    }
                }
            }
        }
    }
}
