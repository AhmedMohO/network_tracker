plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.anonymous.network_tracker"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.anonymous.network_tracker"
        minSdk = 24
        targetSdk = 36
        versionCode = 14
        versionName = "2.0.0"

        testInstrumentationRunner = "com.anonymous.network_tracker.ValidationTestRunner"
    }

    signingConfigs {
        create("release") {
            storeFile = file("../credentials/release.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("release")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }
    sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/firebaseAssets"))
}

val copyFirebaseConfiguration by tasks.registering {
    doLast {
        val source = rootProject.file("google-services.json")
        val target = layout.buildDirectory.file("generated/firebaseAssets/google-services.json").get().asFile
        if (source.exists()) {
            target.parentFile.mkdirs()
            source.copyTo(target, overwrite = true)
        } else target.delete()
    }
}
tasks.named("preBuild").configure { dependsOn(copyFirebaseConfiguration) }
tasks.matching { it.name == "connectedDebugAndroidTest" }.configureEach {
    doFirst {
        check(android.buildTypes.getByName("debug").applicationIdSuffix == ".validation20261105") {
            "Run device tests with --init-script scripts/validation.init.gradle to protect the installed app."
        }
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.1")
    implementation("androidx.tracing:tracing:1.1.0")
    implementation("androidx.concurrent:concurrent-futures:1.2.0")
    implementation("androidx.compose.ui:ui:1.6.8")
    implementation("androidx.compose.ui:ui-graphics:1.6.8")
    implementation("androidx.compose.ui:ui-tooling-preview:1.6.8")
    implementation("androidx.compose.material3:material3:1.2.1")
    implementation("androidx.compose.material:material-icons-extended:1.6.8")

    // Room Database (uses OS SQLite - 0MB .so overhead)
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")

    // WorkManager (Background snapshot & limits check)
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    // Networking (Supabase RPC & Updater)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Google Play Services Code Scanner (Dynamic barcode scanner ~200KB)
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
    implementation("com.google.zxing:core:3.5.3")
    implementation("com.google.firebase:firebase-messaging:25.0.1")

    // Testing
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20180813")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test:core-ktx:1.7.0")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    // Older Espresso reflects an InputManager method removed on current Android.
    androidTestImplementation("androidx.test.espresso:espresso-core:3.7.0")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4:1.6.8")
}
