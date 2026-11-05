package com.anonymous.network_tracker.data.db

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [DailyUsageEntity::class], version = 1, exportSchema = false)
abstract class UsageDatabase : RoomDatabase() {
    abstract fun dailyUsageDao(): DailyUsageDao

    companion object {
        const val DB_NAME = "usage-archive.db"

        @Volatile
        private var INSTANCE: UsageDatabase? = null

        fun getDatabasePath(context: Context): String {
            val expoFile = java.io.File(context.filesDir, "SQLite/$DB_NAME")
            if (expoFile.exists()) return expoFile.absolutePath
            val standardFile = context.getDatabasePath(DB_NAME)
            if (standardFile.exists()) return standardFile.absolutePath
            expoFile.parentFile?.mkdirs()
            return expoFile.absolutePath
        }

        fun getInstance(context: Context): UsageDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE?.let { return@synchronized it }
                val dbPath = getDatabasePath(context.applicationContext)
                migrateLegacyArchive(dbPath)
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    UsageDatabase::class.java,
                    dbPath
                )
                .addCallback(object : RoomDatabase.Callback() {
                    override fun onOpen(db: SupportSQLiteDatabase) {
                        super.onOpen(db)
                        // Run WAL checkpoint on database open to truncate the -wal file and bound size
                        try {
                            db.query("PRAGMA wal_checkpoint(TRUNCATE)").close()
                        } catch (_: Exception) {
                        }
                    }
                })
                .build()
                INSTANCE = instance
                instance
            }
        }

        private fun migrateLegacyArchive(path: String) {
            val file = java.io.File(path)
            if (!file.exists()) return
            SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READWRITE).use { db ->
                val columns = db.rawQuery("PRAGMA table_info(daily_usage)", null).use { cursor ->
                    buildSet { while (cursor.moveToNext()) add(cursor.getString(cursor.getColumnIndexOrThrow("name"))) }
                }
                if (columns.isEmpty() || "ssid" in columns) return
                db.beginTransaction()
                try {
                    for (statement in ArchiveMigration.LEGACY_SQL.split(';')) {
                        if (statement.isNotBlank()) db.execSQL(statement)
                    }
                    db.setTransactionSuccessful()
                } finally {
                    db.endTransaction()
                }
            }
        }
    }
}

