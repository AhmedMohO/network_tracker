package com.anonymous.network_tracker.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

data class AggregatedAppUsage(
    val uid: Int,
    val app_name: String?,
    val package_name: String?,
    val download: Long,
    val upload: Long
)

data class WifiSliceUsage(
    val ssid: String,
    val uid: Int,
    val app_name: String?,
    val package_name: String?,
    val download: Long,
    val upload: Long
)

data class ArchivedSeriesUsage(val day_start: Long, val download: Long, val upload: Long)

@Dao
interface DailyUsageDao {

    @Query("""
        SELECT day_start, SUM(download) AS download, SUM(upload) AS upload
        FROM daily_usage
        WHERE day_start >= :start AND day_start < :end
          AND (:network = 'ALL' OR network = :network)
          AND (:uid IS NULL OR uid = :uid)
        GROUP BY day_start ORDER BY day_start
    """)
    suspend fun getSeries(start: Long, end: Long, network: String, uid: Int?): List<ArchivedSeriesUsage>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(rows: List<DailyUsageEntity>)

    @Query("DELETE FROM daily_usage WHERE day_start = :dayStart")
    suspend fun deleteDay(dayStart: Long)

    @Query("SELECT day_start FROM archived_days WHERE day_start >= :start AND day_start < :end")
    suspend fun getCompletedDays(start: Long, end: Long): List<Long>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun markCompleted(day: ArchivedDayEntity)

    @Query("DELETE FROM archived_days WHERE day_start < :cutoff")
    suspend fun pruneCompletedDays(cutoff: Long)

    @Query("SELECT * FROM daily_usage WHERE day_start >= :start AND day_start < :end")
    suspend fun getRows(start: Long, end: Long): List<DailyUsageEntity>

    @Query("""
        SELECT uid,
               MAX(app_name)     AS app_name,
               MAX(package_name) AS package_name,
               SUM(download)     AS download,
               SUM(upload)       AS upload
          FROM daily_usage
         WHERE day_start >= :start AND day_start < :end
         GROUP BY uid
    """)
    suspend fun getUsageAllNetworks(start: Long, end: Long): List<AggregatedAppUsage>

    @Query("""
        SELECT uid,
               MAX(app_name)     AS app_name,
               MAX(package_name) AS package_name,
               SUM(download)     AS download,
               SUM(upload)       AS upload
          FROM daily_usage
         WHERE day_start >= :start AND day_start < :end AND network = :network
         GROUP BY uid
    """)
    suspend fun getUsageByNetwork(start: Long, end: Long, network: String): List<AggregatedAppUsage>

    @Query("""
        SELECT ssid,
               uid,
               MAX(app_name)     AS app_name,
               MAX(package_name) AS package_name,
               SUM(download)     AS download,
               SUM(upload)       AS upload
          FROM daily_usage
         WHERE day_start >= :start AND day_start < :end AND network = 'WIFI'
         GROUP BY ssid, uid
    """)
    suspend fun getUsageByWifiNetwork(start: Long, end: Long): List<WifiSliceUsage>

    @Query("DELETE FROM daily_usage WHERE day_start < :cutoff")
    suspend fun pruneOlderThan(cutoff: Long): Int

    @Query("SELECT MIN(day_start) FROM daily_usage")
    suspend fun getEarliestDay(): Long?
}
