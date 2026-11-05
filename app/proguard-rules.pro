# NetTrack R8 ProGuard Rules

# Room
-keepclassmembers class * extends androidx.room.RoomDatabase {
    <init>();
}
-keep class * extends androidx.room.RoomDatabase
-dontwarn androidx.room.paging.**

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**

# Keep models and entities
-keep class com.anonymous.network_tracker.data.model.** { *; }
-keep class com.anonymous.network_tracker.data.db.** { *; }

