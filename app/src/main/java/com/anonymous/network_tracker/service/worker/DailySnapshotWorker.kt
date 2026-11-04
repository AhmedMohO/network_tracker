package com.anonymous.network_tracker.service.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.anonymous.network_tracker.data.repository.UsageRepository

class DailySnapshotWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        return try {
            val repo = UsageRepository.getInstance(applicationContext)
            repo.performBackgroundCheck()
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }
}
