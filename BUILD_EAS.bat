@echo off
cd /d d:\ChatApp\app

echo ============================================
echo    Building with EAS Cloud
echo ============================================
echo.
echo Starting APK build on Expo servers...
echo.

REM Use node directly instead of npx to avoid PowerShell issues
node node_modules\eas-cli\bin\eas.js build --platform android

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================
    echo    Build Started Successfully!
    echo ============================================
    echo.
    echo Your app is being built in the cloud.
    echo You can check status at: https://expo.dev
    echo.
) else (
    echo.
    echo EAS not installed locally. Installing...
    call npm install -g eas-cli
    echo.
    echo Retrying build...
    eas build --platform android
)

pause
