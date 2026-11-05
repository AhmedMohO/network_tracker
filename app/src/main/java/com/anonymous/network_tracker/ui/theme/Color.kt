package com.anonymous.network_tracker.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Keep existing screen tokens while resolving them from the active theme.
val DarkBackground: Color @Composable get() = MaterialTheme.colorScheme.background
val DarkSurface: Color @Composable get() = MaterialTheme.colorScheme.surface
val DarkSurfaceVariant: Color @Composable get() = MaterialTheme.colorScheme.surfaceVariant
val DarkBorder: Color @Composable get() = MaterialTheme.colorScheme.outline
val AccentPrimary: Color @Composable get() = MaterialTheme.colorScheme.primary
val AccentPrimaryVariant: Color @Composable get() = MaterialTheme.colorScheme.primaryContainer
val AccentSecondary: Color @Composable get() = MaterialTheme.colorScheme.secondary
val TextPrimary: Color @Composable get() = MaterialTheme.colorScheme.onSurface
val TextSecondary: Color @Composable get() = MaterialTheme.colorScheme.onSurfaceVariant
val TextMuted: Color @Composable get() = MaterialTheme.colorScheme.onSurfaceVariant
val SuccessGreen = Color(0xFF10B981)
val WarningAmber = Color(0xFFF59E0B)
val DangerRed = Color(0xFFEF4444)
val WifiPurple = Color(0xFF8B5CF6)
val MobileBlue = Color(0xFF0284C7)
