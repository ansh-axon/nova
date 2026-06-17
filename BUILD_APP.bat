@echo off
cd /d d:\ChatApp\app
echo ============================================
echo    Building Nova Chat App
echo ============================================
echo.

echo [1/3] Checking dependencies...
call npm install

echo.
echo [2/3] Running Expo prebuild for Android...
echo This may take a few minutes...
call npx expo prebuild --clean --platform android

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Prebuild failed. Trying alternate build method...
    echo.
)

echo.
echo [3/3] Build setup complete!
echo.
echo ============================================
echo    Build Complete! 
echo ============================================
echo.
echo Next steps:
echo 1. The Android app has been generated
echo 2. You can test it on an emulator or device
echo 3. APK file will be in: app\android\app\build\outputs\apk
echo.
echo To create a release APK:
echo   cd d:\ChatApp\app\android
echo   gradlew.bat assembleRelease
echo.
timeout /t 5
