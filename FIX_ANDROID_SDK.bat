@echo off
echo ============================================
echo    Android SDK Configuration Fix
echo ============================================
echo.

echo ERROR: Android SDK not found!
echo.
echo Android SDK needs to be installed to build the APK.
echo.
echo ============================================
echo    3 QUICK SOLUTIONS:
echo ============================================
echo.

echo OPTION 1: Use EAS Cloud Build (EASIEST - No Installation)
echo ============================================
echo This builds the APK on Expo's cloud servers
echo Command: npx eas build --platform android --local
echo.

echo OPTION 2: Install Android Studio + SDK
echo ============================================
echo 1. Download from: https://developer.android.com/studio
echo 2. Install Android Studio
echo 3. Run setup wizard and install SDK
echo 4. Set ANDROID_HOME in environment variables
echo 5. Run build again
echo.

echo OPTION 3: Manual SDK Installation (Advanced)
echo ============================================
echo 1. Download Android SDK Command-line Tools
echo 2. Extract to desired location
echo 3. Run this PowerShell command:
echo    $env:ANDROID_HOME = "C:\path\to\android\sdk"
echo    [Environment]::SetEnvironmentVariable("ANDROID_HOME", $env:ANDROID_HOME, "User")
echo.

echo ============================================
echo    RECOMMENDED: Use EAS Build
echo ============================================
echo.
echo cd d:\ChatApp\app
echo npx eas build --platform android --local
echo.

pause
