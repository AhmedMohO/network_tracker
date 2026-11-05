package com.anonymous.network_tracker.ui.theme

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import org.json.JSONObject
import java.util.Locale

object Translations {
    @Volatile private var arabic: Map<String, String>? = null
    fun load(context: Context): Map<String, String> = arabic ?: synchronized(this) {
        arabic ?: context.assets.open("translations-ar.json").bufferedReader().use { reader ->
            val json = JSONObject(reader.readText())
            json.keys().asSequence().associateWith { json.getString(it) }
        }.also { arabic = it }
    }
    fun text(dictionary: Map<String, String>, language: String, text: String, vararg args: Any?): String {
        val translated = if (language == "ar") dictionary[text] ?: text else text
        return if (args.isEmpty()) translated else String.format(Locale.forLanguageTag(language), translated, *args)
    }
}

@Composable
fun tr(text: String, vararg args: Any?): String {
    val context = LocalContext.current
    val dictionary = remember(context.applicationContext) { Translations.load(context.applicationContext) }
    return Translations.text(dictionary, LocalLanguage.current, text, *args)
}
