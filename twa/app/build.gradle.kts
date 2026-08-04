plugins {
    id("com.android.application")
}

android {
    namespace = "com.kirkforge.foragerflow"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.kirkforge.foragerflow"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "2.1.0"

        val twaHost = project.findProperty("twaHost") as? String
            ?: System.getenv("TWA_HOST")
            ?: "foragerflow.example.com"
        buildConfigField("String", "TWA_HOST", "\"$twaHost\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.2")
}
