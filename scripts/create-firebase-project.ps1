<#
  create-firebase-project.ps1
  Helper script to create a Firebase project via the Firebase CLI.

  Usage (PowerShell):
    powershell -ExecutionPolicy Bypass -File .\scripts\create-firebase-project.ps1 -ProjectId candel-overtime-app -DisplayName "Candel Overtime App"

  Notes:
  - Requires the Firebase CLI (`firebase`) installed and available in PATH.
  - The script will call `firebase login` interactively if you're not logged in.
  - This script only runs the `projects:create` CLI command; you still need to enable services (Authentication, Hosting) in the Firebase Console or via additional CLI commands.
#>

param(
  [Parameter(Mandatory=$false)]
  [string]$ProjectId = "candel-overtime-app",

  [Parameter(Mandatory=$false)]
  [string]$DisplayName = "Candel Overtime App"
)

function Check-Command($name){
  try { Get-Command $name -ErrorAction Stop | Out-Null; return $true } catch { return $false }
}

if (-not (Check-Command firebase)) {
  Write-Error "Firebase CLI not found. Install it with: npm install -g firebase-tools"
  exit 1
}

Write-Host "Logging into Firebase (if not already). A browser window may open..." -ForegroundColor Cyan
& firebase login

Write-Host "Creating project id '$ProjectId' (display name: '$DisplayName')..." -ForegroundColor Cyan
& firebase projects:create $ProjectId --display-name "$DisplayName"
if ($LASTEXITCODE -ne 0) {
  Write-Error "firebase projects:create exited with code $LASTEXITCODE"
  exit 1
}
Write-Host "Project creation requested. If creation succeeds, link the project to this repo with:`n  firebase use --add" -ForegroundColor Green

Write-Host "Done. Next steps:" -ForegroundColor Yellow
Write-Host "  1) Run 'firebase use --add' to select the project and update .firebaserc." -ForegroundColor White
Write-Host "  2) Run 'npm run build' and then 'firebase deploy --only hosting' to deploy hosting." -ForegroundColor White
Write-Host "  3) In Firebase Console, enable Authentication and add Authorized domains (e.g., http://localhost:5173)." -ForegroundColor White

exit 0
