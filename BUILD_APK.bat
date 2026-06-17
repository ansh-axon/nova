@echo off
cd /d d:\ChatApp\app\android

echo ============================================
echo    Building APK with Gradle
echo ============================================
echo.

echo Checking for gradlew.bat...
if not exist gradlew.bat (
    echo ERROR: gradlew.bat not found!
    echo Attempting to find gradle wrapper...
    dir /s /b gradlew.bat 2>nul
    pause
    exit /b 1
)

echo.
echo [1/2] Building debug APK...
echo This may take 10-30 minutes...
echo.

call gradlew.bat assembleDebug

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Build failed!
    timeout /t 5
    exit /b 1
)

echo.
echo [2/2] Build successful!
echo.
echo ============================================
echo    APK Build Complete!
echo ============================================
echo.

echo APK location: d:\ChatApp\app\android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo APK Details:
dir /b app\build\outputs\apk\debug\*.apk 2>nul

echo.
echo To test the app:
echo 1. Connect an Android device with USB debugging enabled, or start an emulator
echo 2. Run: adb install -r d:\ChatApp\app\android\app\build\outputs\apk\debug\app-debug.apk
echo 3. Or use Android Studio to deploy the app
echo.

timeout /t 5
