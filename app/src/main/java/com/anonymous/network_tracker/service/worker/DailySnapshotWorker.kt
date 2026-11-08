package com.anonymous.network_tracker.service.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.anonymous.network_tracker.data.repository.UsageRepository
import kotlinx.coroutines.CancellationException
import com.anonymous.network_tracker.service.SyncKeepAlive

class DailySnapshotWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        if (!SyncKeepAlive.isEnabled(applicationContext)) return Result.success()
        return try {
            val repo = UsageRepository.getInstance(applicationContext)
            repo.performBackgroundCheck()
            Result.success()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            Result.retry()
        }
    }
}

