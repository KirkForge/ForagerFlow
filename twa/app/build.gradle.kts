plugins {
    id("com.android.application")
}

android {
    namespace = "com.kirkforge.foragerflow"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.kirkforge.foragerflow"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "2.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
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
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
}
