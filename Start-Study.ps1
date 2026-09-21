param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$studyUrl = 'http://127.0.0.1:4173/'
try {
    $studyHealth = Invoke-RestMethod -Uri ($studyUrl + '__saa_health') -TimeoutSec 2
    if ($studyHealth.app -eq 'saa-study') { if (!$NoBrowser) { Start-Process $studyUrl }; exit }
} catch { }
$studyNodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$studyNode = if ($studyNodeCommand) { $studyNodeCommand.Source } else { $null }
if (!$studyNode -or !(Test-Path -LiteralPath $studyNode)) { throw 'Node.js is needed. Install the LTS version from nodejs.org.' }
if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'dist\index.html'))) { throw 'First run: npm ci, then npm run build. See README.md.' }
$studyServer = Join-Path $PSScriptRoot 'scripts\serve.mjs'
$studyProcess = Start-Process -FilePath $studyNode -ArgumentList ('"' + $studyServer + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
for ($studyAttempt = 0; $studyAttempt -lt 25; $studyAttempt++) {
    Start-Sleep -Milliseconds 200
    try {
        $studyHealth = Invoke-RestMethod -Uri ($studyUrl + '__saa_health') -TimeoutSec 1
        if ($studyHealth.app -eq 'saa-study') { if (!$NoBrowser) { Start-Process $studyUrl }; exit }
    } catch { }
    if ($studyProcess.HasExited) { break }
}
throw 'The study app could not start. Port 4173 may be in use.'
