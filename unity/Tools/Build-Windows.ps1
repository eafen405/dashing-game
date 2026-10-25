param(
    [string]$EditorPath,
    [switch]$VerifyReference,
    [switch]$ValidateOnly
)
$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not $EditorPath) {
    $installRoots = @('C:\Unity\Hub\Editor', 'C:\Program Files\Unity\Hub\Editor')
    $hubConfig = Join-Path $env:APPDATA 'UnityHub\secondaryInstallPath.json'
    if (Test-Path -LiteralPath $hubConfig) {
        $installRoots += (Get-Content -LiteralPath $hubConfig -Raw | ConvertFrom-Json)
    }
    foreach ($installRoot in $installRoots) {
        $candidate = Join-Path $installRoot '2022.3.62f3c1\Editor\Unity.exe'
        if (Test-Path -LiteralPath $candidate) { $EditorPath = $candidate; break }
    }
}
if (-not $EditorPath -or -not (Test-Path -LiteralPath $EditorPath)) {
    throw 'Unity 2022.3.62f3c1 not found. Pass -EditorPath with the installed Unity.exe path.'
}
Push-Location -LiteralPath $projectPath
try {
    if ($VerifyReference) {
        & node (Join-Path $PSScriptRoot 'reference.mjs')
        if ($LASTEXITCODE -ne 0) { throw 'TypeScript reference generation failed. Run npm.cmd ci in the web project.' }
    }
    $method = if ($ValidateOnly) { 'Dashing.Editor.UnityPort.Validate' } else { 'Dashing.Editor.UnityPort.BuildWindows' }
    $marker = if ($ValidateOnly) { 'DASHING_RULE_CHECKS_PASS' } else { 'DASHING_WINDOWS_BUILD_PASS' }
    $logPath = Join-Path $projectPath 'build-script.log'
    $arguments = '-batchmode -nographics -quit -projectPath "' + $projectPath + '" -executeMethod ' + $method + ' -logFile "' + $logPath + '"'
    $started = Get-Date
    $buildProcess = Start-Process -FilePath $EditorPath -ArgumentList $arguments -WindowStyle Hidden -PassThru
    # Unity's launcher may hand off to a child process, so use the completion log.
    $deadline = $started.AddMinutes(12)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        if (-not (Test-Path -LiteralPath $logPath)) { continue }
        if ((Get-Item -LiteralPath $logPath).LastWriteTime -lt $started) { continue }
        $log = Get-Content -LiteralPath $logPath -Raw
        if ($log -match 'Application will terminate with return code [1-9]|Compilation failed|Scripts have compiler errors|executeMethod.*threw exception') {
            throw ('Unity build failed. See ' + $logPath)
        }
        if ($log.Contains($marker) -and $log.Contains('Exiting batchmode successfully')) {
            Write-Host ('PASS: ' + $method)
            if (-not $ValidateOnly) { Write-Host (Join-Path $projectPath 'Builds\Windows\Dashing.exe') }
            return
        }
    }
    throw ('Unity build timed out. See ' + $logPath + '. Close another Editor using this project and retry.')
} finally { Pop-Location }
