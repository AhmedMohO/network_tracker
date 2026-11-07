package com.anonymous.network_tracker

import android.database.sqlite.SQLiteDatabase
import androidx.room.Room
import androidx.room.withTransaction
import androidx.test.platform.app.InstrumentationRegistry
import com.anonymous.network_tracker.data.db.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

class ArchiveDatabaseTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun versionOneMigrationKeepsRowsAndTheirUnknownStateHistory() = runBlocking {
        val name = "archive-migration-${UUID.randomUUID()}.db"
        try {
            val path = context.getDatabasePath(name).apply { parentFile?.mkdirs() }
            SQLiteDatabase.openOrCreateDatabase(path, null).use { db ->
                db.execSQL("CREATE TABLE daily_usage(day_start INTEGER NOT NULL,uid INTEGER NOT NULL,network TEXT NOT NULL,ssid TEXT NOT NULL,app_name TEXT,package_name TEXT,download INTEGER NOT NULL,upload INTEGER NOT NULL,PRIMARY KEY(day_start,uid,network,ssid))")
                db.execSQL("CREATE INDEX idx_daily_day ON daily_usage(day_start)")
                db.execSQL("INSERT INTO daily_usage VALUES(0,10,'WIFI','Home','Browser','app.browser',123,45)")
                db.version = 1
            }
            val db = Room.databaseBuilder(context, UsageDatabase::class.java, name)
                .addMigrations(UsageDatabase.MIGRATION_1_2).build()
            try {
                    val row = db.dailyUsageDao().getRows(0, 24).single()
                    assertEquals(123L, row.download)
                    assertEquals(45L, row.upload)
                    assertNull(row.foreground)
                    assertNull(row.background)
                    assertTrue(db.dailyUsageDao().getCompletedDays(0, 24).isEmpty())
            } finally { db.close() }
        } finally {
            context.deleteDatabase(name)
        }
    }

    @Test fun completionAndRowsCommitTogetherIncludingEmptyDays() = runBlocking {
        val db = Room.inMemoryDatabaseBuilder(context, UsageDatabase::class.java).build()
        try {
            val dao = db.dailyUsageDao()
            val row = DailyUsageEntity(0, 10, "WIFI", "Home", download = 100, upload = 20,
                foreground = 50, background = 70, dayEnd = 24)
            try {
                db.withTransaction {
                    dao.insertAll(listOf(row))
                    dao.markCompleted(ArchivedDayEntity(0, 25))
                    error("Interrupted snapshot")
                }
            } catch (_: IllegalStateException) { }
            assertTrue(dao.getRows(0, 24).isEmpty())
            assertTrue(dao.getCompletedDays(0, 24).isEmpty())
            db.withTransaction {
                dao.insertAll(listOf(row))
                dao.markCompleted(ArchivedDayEntity(0, 25))
                dao.markCompleted(ArchivedDayEntity(24, 49))
            }
            assertEquals(listOf(0L, 24L), dao.getCompletedDays(0, 48).sorted())
            assertEquals(50L, dao.getRows(0, 24).single().foreground)
            assertTrue(dao.getRows(24, 48).isEmpty())
        } finally { db.close() }
    }
}
