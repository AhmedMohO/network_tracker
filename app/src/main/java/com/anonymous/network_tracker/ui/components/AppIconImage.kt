package com.anonymous.network_tracker.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.graphics.drawable.toBitmap
import com.anonymous.network_tracker.core.AppResolver
import com.anonymous.network_tracker.ui.theme.DarkSurfaceVariant
import com.anonymous.network_tracker.ui.theme.TextMuted

@Composable
fun AppIconImage(
    packageName: String?,
    appName: String,
    modifier: Modifier = Modifier,
    size: Dp = 40.dp
) {
    val context = LocalContext.current
    val resolver = remember(context) { AppResolver(context) }

    val bitmap = remember(packageName) {
        packageName?.let {
            resolver.iconDrawable(it)?.toBitmap(96, 96)?.asImageBitmap()
        }
    }

    val shape = RoundedCornerShape(10.dp)

    if (bitmap != null) {
        Image(
            bitmap = bitmap,
            contentDescription = appName,
            modifier = modifier
                .size(size)
                .clip(shape)
        )
    } else {
        val initial = appName.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "?"
        Box(
            modifier = modifier
                .size(size)
                .clip(shape)
                .background(DarkSurfaceVariant),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = initial,
                color = TextMuted,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp
            )
        }
    }
}
