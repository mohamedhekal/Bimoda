package app.bimoda.android

import com.google.firebase.Firebase
import com.google.firebase.appcheck.appCheck
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory

/** Debug builds: the debug token printed to Logcat must be registered in the Firebase console (App Check > Manage debug tokens). */
fun installAppCheck() {
    Firebase.appCheck.installAppCheckProviderFactory(DebugAppCheckProviderFactory.getInstance())
}

const val APP_CHECK_MODE = "debug provider"
