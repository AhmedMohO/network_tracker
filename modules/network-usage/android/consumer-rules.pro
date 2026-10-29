# Expo loads this class by the name stored in AndroidManifest.xml.
-keep class expo.modules.adapters.react.apploader.RNHeadlessAppLoader { *; }

# SyncKeepAlive calls this consumer through reflection.
-keep class expo.modules.backgroundtask.BackgroundTaskConsumer {
    public void executeTask(expo.modules.interfaces.taskManager.TaskExecutionCallback);
}
