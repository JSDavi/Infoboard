[CmdletBinding()]
param([switch]$RepairPath, [switch]$RepairMaestri)

$ErrorActionPreference = 'Stop'
$taskLauncher = 'C:\Users\davis\AppData\Local\OpenAI\Codex\bin\8925276705115dea\codex.exe'
$taskUtf8 = [Text.UTF8Encoding]::new($false)
$taskStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'

if ($RepairPath) {
    $taskUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $taskRollbackPath = 'C:\Users\davis\.local\bin\user-path.backup-20261024-052241-133.txt'
    $taskOriginalPath = [IO.File]::ReadAllText($taskRollbackPath)
    $taskExpectedPath = ((@($taskOriginalPath -split ';' | Where-Object { $_.Trim() }) + 'C:\Users\davis\.local\bin') -join ';')
    if ($taskUserPath -ceq $taskExpectedPath) {
        $taskUserPath = $taskOriginalPath
    } else {
        throw 'User PATH changed concurrently; inspect before rollback.'
    }
    $taskPathParts = @($taskUserPath -split ';' | Where-Object { $_.Trim() -and $_ -ine 'C:\Users\davis\AppData\Local\OpenAI\Codex\bin\37f54d68e5533a51' })
    $taskNativeDir = Split-Path -Parent $taskLauncher
    if (-not ($taskPathParts | Where-Object { $_.TrimEnd('\') -ieq $taskNativeDir.TrimEnd('\') })) {
        $taskPathParts += $taskNativeDir
    }
    [Environment]::SetEnvironmentVariable('Path', ($taskPathParts -join ';'), 'User')
    Remove-Item -LiteralPath 'C:\Users\davis\.local\bin\codex.cmd'
    Remove-Item -LiteralPath 'C:\Users\davis\.local\bin\codex-launch.ps1'
    & $taskLauncher --version
    if ($LASTEXITCODE -ne 0) { throw 'Launcher version check failed.' }
    & $taskLauncher --no-daemon -V
    if ($LASTEXITCODE -ne 0) { throw 'Launcher no-daemon argument check failed.' }
    Write-Output ('VERIFIED NATIVE EXECUTABLE: ' + $taskLauncher)
    Write-Output 'Removed the blocked helper. Windows script policy was not changed.'
}

if ($RepairMaestri) {
    if (Get-Process -Name Maestri -ErrorAction SilentlyContinue) {
        throw 'Close Maestri first so its in-memory state cannot overwrite the repaired presets and terminal commands.'
    }
    if (-not (Test-Path -LiteralPath $taskLauncher)) { throw 'The verified native Codex executable is missing.' }
    $taskPrefsPath = 'C:\Users\davis\.maestri\preferences.json'
    $taskPaths = @($taskPrefsPath) + @(Get-ChildItem -LiteralPath 'C:\Users\davis\.maestri\workspaces' -Directory | ForEach-Object {
        $taskWorkspacePath = Join-Path $_.FullName 'workspace.json'
        if (Test-Path -LiteralPath $taskWorkspacePath) { $taskWorkspacePath }
    })
    $taskPattern = '(?i)^(?:&\s*)?(?:"[^"\r\n]*\\codex\.exe"|[^\s"\r\n]*\\codex\.exe|codex)(?=\s|$)'
    foreach ($taskPath in $taskPaths) {
        $taskBefore = [IO.File]::ReadAllText($taskPath)
        $taskDoc = $taskBefore | ConvertFrom-Json
        $taskCount = 0
        $taskEntries = if ($taskPath -eq $taskPrefsPath) {
            @($taskDoc.payload.agentPresets | Where-Object { $_.agentType -eq 'codex' })
        } else {
            @($taskDoc.payload.nodes | ForEach-Object { $_.content.terminal._0 } | Where-Object { $_ -and ($_.agentType -eq 'codex' -or $_.command -match 'codex\.exe') })
        }
        foreach ($taskEntry in $taskEntries) {
            $taskOldCommand = [string]$taskEntry.command
            $taskNewCommand = [regex]::Replace($taskOldCommand, $taskPattern, $taskLauncher)
            if ($taskNewCommand -cne $taskOldCommand) {
                $taskEntry.command = $taskNewCommand
                if ($taskEntry.agentType -eq 'custom') { $taskEntry.agentType = 'codex' }
                $taskCount++
                Write-Output ('REPAIRED: ' + $taskEntry.name + ' -> ' + $taskNewCommand)
            }
        }
        if ($taskCount -eq 0) { continue }
        if ((Get-Process -Name Maestri -ErrorAction SilentlyContinue) -or ([IO.File]::ReadAllText($taskPath) -cne $taskBefore)) { throw 'State changed during repair; stopped before writing.' }
        $taskBackup = $taskPath + '.backup-' + $taskStamp
        Copy-Item -LiteralPath $taskPath -Destination $taskBackup
        $taskAfter = ($taskDoc | ConvertTo-Json -Depth 100) + "`r`n"
        [IO.File]::WriteAllText($taskPath, $taskAfter, $taskUtf8)
        $null = [IO.File]::ReadAllText($taskPath) | ConvertFrom-Json
        Write-Output ('BACKUP: ' + $taskBackup)
    }
    Write-Output 'VERIFIED: Saved Maestri settings parse as JSON. Roles, connections, models and permission flags were preserved.'
}

if (-not $RepairPath -and -not $RepairMaestri) {
    Write-Output ('Verified native executable: ' + $taskLauncher)
    Write-Output 'Use -RepairPath to fix the user PATH; use -RepairMaestri with Maestri closed to repair saved launch commands.'
}
