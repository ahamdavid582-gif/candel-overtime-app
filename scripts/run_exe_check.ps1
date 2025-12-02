# Launch the portable EXE non-blocking and report the CandelOvertime process info
$exe = 'C:\Users\Dell\candel-overtime-app\dist-electron\CandelOvertime 0.0.0.exe'
if (Test-Path $exe) {
    Start-Process -FilePath $exe
    Start-Sleep -Seconds 3
    Get-Process -Name CandelOvertime -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,StartTime
} else {
    Write-Output 'missing'
}
