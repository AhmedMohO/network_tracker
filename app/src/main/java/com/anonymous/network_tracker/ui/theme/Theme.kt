package com.anonymous.network_tracker.ui.theme

import android.app.Activity
import android.content.Context
import android.content.res.Configuration
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.LayoutDirection
import androidx.core.view.WindowCompat
import java.util.Locale

private val DarkColors = darkColorScheme(
    primary = Color(0xFF38BDF8), onPrimary = Color(0xFF082F49),
    primaryContainer = Color(0xFF1E293B), secondary = Color(0xFFA78BFA),
    background = Color(0xFF090D16), onBackground = Color(0xFFF8FAFC),
    surface = Color(0xFF111726), onSurface = Color(0xFFF8FAFC),
    surfaceVariant = Color(0xFF1E293B), onSurfaceVariant = Color(0xFF94A3B8),
    outline = Color(0xFF1E293B)
)
private val LightColors = lightColorScheme(
    primary = Color(0xFF0284C7), onPrimary = Color.White,
    primaryContainer = Color(0xFFF1F5F9), secondary = Color(0xFF7C3AED),
    background = Color(0xFFF8FAFC), onBackground = Color(0xFF090A0C),
    surface = Color.White, onSurface = Color(0xFF090A0C),
    surfaceVariant = Color(0xFFF1F5F9), onSurfaceVariant = Color(0xFF64748B),
    outline = Color(0xFFE2E8F0)
)
val LocalLanguage = staticCompositionLocalOf { "en" }

@Composable
fun NetTrackTheme(darkTheme: Boolean = isSystemInDarkTheme(), language: String = "en", content: @Composable () -> Unit) {
    val colors = if (darkTheme) DarkColors else LightColors
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    val localized = remember(context, configuration, language) {
        android.view.ContextThemeWrapper(context, com.anonymous.network_tracker.R.style.Theme_NetTrack).apply {
            applyOverrideConfiguration(Configuration(configuration).apply { setLocale(Locale.forLanguageTag(language)) })
        }
    }
    val view = LocalView.current
    if (!view.isInEditMode) SideEffect {
        context.activity()?.window?.let { window ->
            window.statusBarColor = colors.background.toArgb()
            window.navigationBarColor = colors.surface.toArgb()
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !darkTheme
                isAppearanceLightNavigationBars = !darkTheme
            }
        }
    }
    CompositionLocalProvider(
        LocalLanguage provides language,
        LocalContext provides localized,
        LocalConfiguration provides localized.resources.configuration,
        LocalLayoutDirection provides if (language == "ar") LayoutDirection.Rtl else LayoutDirection.Ltr
    ) { MaterialTheme(colorScheme = colors, content = content) }
}
private tailrec fun Context.activity(): Activity? = when (this) {
    is Activity -> this
    is android.content.ContextWrapper -> baseContext.activity()
    else -> null
}
