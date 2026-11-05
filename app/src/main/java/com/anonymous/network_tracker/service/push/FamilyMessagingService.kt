package com.anonymous.network_tracker.service.push

import com.anonymous.network_tracker.service.worker.UsageWork
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class FamilyMessagingService : FirebaseMessagingService() {
    // Push is only a wake-up signal; remote payloads never configure the device.
    override fun onMessageReceived(message: RemoteMessage) { UsageWork.enqueue(this) }
    override fun onNewToken(token: String) { UsageWork.enqueue(this) }
}
