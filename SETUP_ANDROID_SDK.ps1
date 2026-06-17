# Quick Android SDK Setup for Nova Chat App Build

# Check if Android SDK exists anywhere on system
Write-Host "Searching for Android SDK installation..." -ForegroundColor Yellow

$possiblePaths = @(
    "C:\Android\sdk",
    "$env:USERPROFILE\AppData\Local\Android\sdk",
    "C:\Program Files\Android\sdk",
    "C:\Program Files (x86)\Android\sdk",
    "$env:USERPROFILE\Android\sdk"
)

$sdkPath = $null
foreach ($path in $possiblePaths) {
    if (Test-Path $path) {
        $sdkPath = $path
        Write-Host "Found Android SDK at: $sdkPath" -ForegroundColor Green
        break
    }
}

if ($null -eq $sdkPath) {
    Write-Host "Android SDK not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "QUICK FIX OPTIONS:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. If you have Android Studio installed:" -ForegroundColor Cyan
    Write-Host "   Set ANDROID_HOME manually:"
    Write-Host "   " -NoNewline
    Write-Host "`$env:ANDROID_HOME = `"C:\Users\YourUsername\AppData\Local\Android\sdk`"" -ForegroundColor White
    Write-Host ""
    
    Write-Host "2. Download Android Studio:" -ForegroundColor Cyan
    Write-Host "   https://developer.android.com/studio" -ForegroundColor White
    Write-Host ""
    
    Write-Host "3. Or use cloud build (EAS):" -ForegroundColor Cyan
    Write-Host "   No SDK needed! Run:" -ForegroundColor White
    Write-Host "   cd d:\ChatApp\app" -ForegroundColor White
    Write-Host "   npx eas build --platform android --local" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "Setting ANDROID_HOME..." -ForegroundColor Green
    $env:ANDROID_HOME = $sdkPath
    
    # Set environment variable permanently
    [Environment]::SetEnvironmentVariable("ANDROID_HOME", $sdkPath, "User")
    Write-Host "ANDROID_HOME set to: $sdkPath" -ForegroundColor Green
    Write-Host ""
    Write-Host "Retrying build in 3 seconds..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
    
    cd d:\ChatApp\app\android
    & .\gradlew.bat assembleDebug
}
