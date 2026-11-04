package com.anonymous.network_tracker.data.db

import android.content.Context
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

        fun getInstance(context: Context): UsageDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    UsageDatabase::class.java,
                    DB_NAME
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
    }
}
