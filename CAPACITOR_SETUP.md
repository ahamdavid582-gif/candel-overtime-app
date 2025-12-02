Steps to create an Android APK using Capacitor (Windows PowerShell)

1. Install Capacitor packages
   npm install @capacitor/core @capacitor/cli --save

2. Build the web app
   npm run build

3. Initialize Capacitor (only once)
   npx cap init "Candel Overtime" com.candel.candel_overtime --web-dir=dist

4. Add Android platform
   npx cap add android

5. Open the Android project in Android Studio
   npx cap open android

6. In Android Studio, build a debug APK or generate a signed release APK.

Notes:
- You must have JDK (Java 11+), Android SDK, and Android Studio installed and configured.
- The build must be run on a machine with Android SDK; this environment cannot produce a native APK without those tools.
- If you want me to run the `npm install` and `npx cap add android` commands here, confirm and I will attempt them (they may fail if Android tools are missing).