# FusionDex Tracker — Save Watcher
# Watches the Infinite Fusion save file in %APPDATA% (which Chrome blocks
# browsers from reading directly) and copies it into a normal folder on your
# Desktop whenever it changes. Point the FusionDex website's "Connect Save"
# at that Desktop folder instead, and it will auto-update from there.

$source = Join-Path $env:APPDATA "infinitefusion-hoenn\File A.rxdata"
$destFolder = Join-Path $env:USERPROFILE "Desktop\FusionDexSync"
$dest = Join-Path $destFolder "File A.rxdata"

if (-not (Test-Path $source)) {
    Write-Host "Could not find save file at: $source" -ForegroundColor Red
    Write-Host "If your save is in a different slot or location, edit the `$source` line at the top of this script." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit
}

if (-not (Test-Path $destFolder)) {
    New-Item -ItemType Directory -Path $destFolder | Out-Null
}

Write-Host "FusionDex save watcher running." -ForegroundColor Green
Write-Host "Watching: $source"
Write-Host "Mirroring to: $dest"
Write-Host "In the FusionDex site, click Connect Save and pick the file from: $destFolder"
Write-Host "Leave this window open while you play. Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host ""

$lastWrite = $null

while ($true) {
    try {
        $current = (Get-Item $source).LastWriteTime
        if ($lastWrite -eq $null -or $current -ne $lastWrite) {
            Copy-Item -Path $source -Destination $dest -Force
            $lastWrite = $current
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Synced save (changed $current)"
        }
    } catch {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Sync error: $_" -ForegroundColor Red
    }
    Start-Sleep -Seconds 2
}
