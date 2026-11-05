package com.anonymous.network_tracker.service.worker

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object UsageWork {
    fun schedule(context: Context) {
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            "usage-threshold-check-native", ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<DailySnapshotWorker>(15, TimeUnit.MINUTES).build()
        )
    }
    fun enqueue(context: Context) {
        WorkManager.getInstance(context).enqueueUniqueWork(
            "usage-check-now", ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<DailySnapshotWorker>().build()
        )
    }
}
