import FirebaseAppCheck
import FirebaseCore
import SwiftUI

@main
struct BimodaApp: App {
    @State private var model = AppModel()

    init() {
        // App Check is required by Firebase AI Logic: debug provider in debug builds, App Attest in release builds.
        #if DEBUG
            AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
        #else
            AppCheck.setAppCheckProviderFactory(AppAttestProviderFactory())
        #endif
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .preferredColorScheme(.dark)
                .task { await model.start() }
        }
    }
}

#if DEBUG
    let appCheckMode = "debug provider"
#else
    let appCheckMode = "App Attest"
#endif
