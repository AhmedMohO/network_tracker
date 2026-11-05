package com.anonymous.network_tracker

import com.anonymous.network_tracker.ui.theme.Translations
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class TranslationsTest {
    private val json = JSONObject(File("src/main/assets/translations-ar.json").readText())
    private val dictionary = json.keys().asSequence().associateWith { json.getString(it) }

    @Test fun languageSelectionAndFormattedValues() {
        assertEquals("Settings", Translations.text(dictionary, "en", "Settings"))
        assertEquals("الإعدادات", Translations.text(dictionary, "ar", "Settings"))
        assertEquals("اليوم ١٥", Translations.text(dictionary, "ar", "Day %d", 15))
        assertEquals("Latest: v2.1", Translations.text(dictionary, "en", "Latest: %s", "v2.1"))
        assertEquals("الأحدث: v2.1", Translations.text(dictionary, "ar", "Latest: %s", "v2.1"))
        assertEquals("unknown server detail", Translations.text(dictionary, "ar", "unknown server detail"))
    }

    @Test fun nativeTemplatesHaveArabicAndMatchingPlaceholders() {
        listOf("Light", "Dark", "System", "All networks", "Child device", "Parent device", "Pair your family",
            "Hide QR", "Show pairing QR", "Stop sharing and unpair", "Unpair all devices").forEach {
            assertTrue("Missing dynamic Arabic label: $it", dictionary.containsKey(it))
        }
        val literal = Regex("""\b(?:tr|localized|line)\("((?:[^"\\]|\\.)*)"""")
        File("src/main/java").walkTopDown().filter { it.extension == "kt" }.forEach { file ->
            literal.findAll(file.readText()).forEach { match ->
                val key = match.groupValues[1]
                assertTrue("Missing Arabic: $key in ${file.name}", dictionary.containsKey(key))
            }
        }
        val format = Regex("""%(?:\d+\$)?[-#+0,(]*\d*(?:\.\d+)?[sdf%]""")
        val named = Regex("""\{\{[^}]+}}""")
        dictionary.forEach { (key, value) ->
            assertTrue("Blank Arabic: $key", value.isNotBlank())
            assertEquals("Format arguments: $key", format.findAll(key).map { it.value }.sorted().toList(), format.findAll(value).map { it.value }.sorted().toList())
            // Original Arabic singular/dual forms intentionally omit the English count.
            assertTrue("Unknown named arguments: $key", named.findAll(key).map { it.value }.toSet().containsAll(named.findAll(value).map { it.value }.toSet()))
        }
    }
}
