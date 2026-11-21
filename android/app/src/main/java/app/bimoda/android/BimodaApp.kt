package app.bimoda.android

import android.app.Application
import com.google.firebase.Firebase
import com.google.firebase.initialize

class BimodaApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Firebase.initialize(this)
        // App Check is required by Firebase AI Logic: debug provider in debug builds, Play Integrity in release builds.
        installAppCheck()
    }
}
