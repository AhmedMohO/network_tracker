package com.anonymous.network_tracker.data.repository

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.io.File

/**
 * Direct native bridge to the SQLite key-value database used by React Native (expo-sqlite/kv-store).
 * File: `context.filesDir/SQLite/ExpoSQLiteStorage`
 * Table: `storage (key TEXT PRIMARY KEY NOT NULL, value TEXT)`
 * Key: `settings.v1`
 */
object ExpoStorageBridge {

    fun getDatabaseFile(context: Context): File {
        val candidates = listOf(
            File(context.filesDir, "SQLite/ExpoSQLiteStorage"),
            File(context.filesDir, "SQLite/ExpoSQLiteStorage.db"),
            context.getDatabasePath("ExpoSQLiteStorage"),
            context.getDatabasePath("ExpoSQLiteStorage.db")
        )
        for (candidate in candidates) {
            if (candidate.exists()) return candidate
        }
        val defaultFile = File(context.filesDir, "SQLite/ExpoSQLiteStorage")
        defaultFile.parentFile?.mkdirs()
        return defaultFile
    }

    private fun openDb(context: Context): SQLiteDatabase {
        val file = getDatabaseFile(context)
        file.parentFile?.mkdirs()
        val db = SQLiteDatabase.openOrCreateDatabase(file, null)
        db.execSQL("CREATE TABLE IF NOT EXISTS storage (key TEXT PRIMARY KEY NOT NULL, value TEXT);")
        return db
    }

    fun getItem(context: Context, key: String): String? {
        if (!getDatabaseFile(context).exists()) return null
        return openDb(context).use { db ->
            db.rawQuery("SELECT value FROM storage WHERE key = ? LIMIT 1;", arrayOf(key)).use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
        }
    }

    fun setItem(context: Context, key: String, value: String) = setItems(context, mapOf(key to value))

    fun removeItem(context: Context, key: String) {
        if (!getDatabaseFile(context).exists()) return
        openDb(context).use { it.delete("storage", "key = ?", arrayOf(key)) }
    }

    fun setItems(context: Context, values: Map<String, String>) {
        openDb(context).use { db ->
            db.beginTransaction()
            try {
                for ((key, value) in values) {
                    val cv = ContentValues().apply { put("key", key); put("value", value) }
                    check(db.insertWithOnConflict("storage", null, cv, SQLiteDatabase.CONFLICT_REPLACE) != -1L) {
                        "Could not persist $key"
                    }
                }
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }
        }
    }
}
