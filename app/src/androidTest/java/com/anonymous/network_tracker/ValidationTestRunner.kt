package com.anonymous.network_tracker

import android.app.Application
import android.content.Context
import androidx.test.runner.AndroidJUnitRunner

class ValidationTestRunner : AndroidJUnitRunner() {
    override fun newApplication(loader: ClassLoader, name: String, context: Context): Application {
        check(context.packageName.endsWith(".validation20261105")) {
            "Device tests require scripts/validation.init.gradle and a separate validation package."
        }
        // Seed the legacy files before the production application's background work can open them.
        return super.newApplication(loader, Application::class.java.name, context)
    }
}
