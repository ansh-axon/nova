@echo off
cd /d d:\ChatApp\app

echo ============================================
echo    BUILDING with EAS (Cloud Build)
echo ============================================
echo.
echo This will build your APK on Expo's servers
echo No local Android SDK required!
echo.

REM First check if we need to install eas-cli
echo [1/2] Checking EAS CLI...
npm list -g eas-cli >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Installing eas-cli globally...
    npm install -g eas-cli
)

echo.
echo [2/2] Starting build...
echo.

REM Run EAS build in local mode (builds on your machine but uses managed resources)
call npx eas build --platform android --local --clear

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================
    echo    BUILD SUCCESSFUL!
    echo ============================================
    echo.
    echo Your APK is ready!
    echo Check the output directory for app-debug.apk
    echo.
) else (
    echo.
    echo Build failed. Try this command instead:
    echo npx eas build --platform android --local
    echo.
)

timeout /t 5
