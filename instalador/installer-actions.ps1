$ErrorActionPreference = 'Stop'
function Assert-NoReparse([string]$Path) {
    $p = [IO.Path]::GetFullPath($Path)
    while ($p) {
        if ((Test-Path -LiteralPath $p) -and ((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'REPARSE' }
        $parent = [IO.Path]::GetDirectoryName($p)
        if ($parent -eq $p) { break }; $p = $parent
    }
}
function Test-Within([string]$Path, [string]$Root) {
    $p = [IO.Path]::GetFullPath($Path).TrimEnd('\'); $r = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    return $p.Equals($r,[StringComparison]::OrdinalIgnoreCase) -or $p.StartsWith($r+'\',[StringComparison]::OrdinalIgnoreCase)
}
function Assert-TargetRoot([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path) -or $Path -notmatch '^[A-Za-z]:\\' -or $Path -match '[!"%&|<>^]' -or $Path.Contains("'")) { throw 'TARGET_ABSOLUTE_LOCAL' }
    $p = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if (-not $p.Equals($Path.TrimEnd('\'),[StringComparison]::OrdinalIgnoreCase) -or $p.Length -le 3) { throw 'TARGET_CANONICAL' }
    $protected = @($env:SystemRoot,$env:ProgramFiles,[Environment]::GetEnvironmentVariable('ProgramFiles(x86)'),$env:ProgramData,$env:USERPROFILE,$env:APPDATA,$env:LOCALAPPDATA,$env:TEMP,[Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('MyDocuments'),[Environment]::GetFolderPath('CommonDesktopDirectory'))
    foreach ($q in $protected) { if ($q -and (Test-Within $q $p)) { throw 'TARGET_PROTECTED_OR_ANCESTOR' } }
    if ($env:SystemRoot -and (Test-Within $p $env:SystemRoot)) { throw 'TARGET_WINDOWS' }
    Assert-NoReparse $p
    return $p
}
function Assert-Tree([string]$Path) {
    Assert-NoReparse $Path
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) { throw 'TREE_MISSING' }
    $stack = New-Object 'Collections.Generic.Stack[string]'; $stack.Push($Path)
    while ($stack.Count) {
        $dir = $stack.Pop()
        foreach ($item in @(Get-ChildItem -LiteralPath $dir -Force -ErrorAction Stop)) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'TREE_REPARSE' }
            if ($item.PSIsContainer) { $stack.Push($item.FullName) }
        }
    }
}
function Assert-App([string]$Path) {
    $p = Assert-TargetRoot $Path
    foreach ($name in @('package.json','server.js')) {
        $file = Join-Path $p $name; Assert-NoReparse $file
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'APP_MISSING' }
    }
    if ((Get-Content -LiteralPath (Join-Path $p 'package.json') -Raw | ConvertFrom-Json).name -cne 'infoboard') { throw 'APP_IDENTITY' }
    return $p
}
function Assert-PrivateAcl([string]$Path) {
    Assert-NoReparse $Path
    $acl = Get-Acl -LiteralPath $Path
    $allowed = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18'); $seen = @()
    foreach ($rule in $acl.Access) {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($sid -notin $allowed -or $rule.AccessControlType -ne 'Allow' -or ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl) { throw 'ACL_PRIVATE' }
        $seen += $sid
    }
    foreach ($sid in $allowed) { if ($sid -notin $seen) { throw 'ACL_MISSING' } }
}
function New-PrivateDirectory([string]$Path) {
    Assert-NoReparse $Path
    if (Test-Path -LiteralPath $Path) { throw 'PRIVATE_ALREADY_EXISTS' }
    [IO.Directory]::CreateDirectory($Path) | Out-Null
    $acl = New-Object Security.AccessControl.DirectorySecurity; $acl.SetAccessRuleProtection($true,$false)
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    foreach ($id in @($sid,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($id,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
    Assert-PrivateAcl $Path
}
function Get-LogDirectory {
    if ($env:IB_RUN_ID -notmatch '^(install|uninstall)-[0-9]+-[0-9]+$' -or -not $env:LOCALAPPDATA) { throw 'LOG_ID' }
    return Join-Path $env:LOCALAPPDATA ('Infoboard\installer-logs\'+$env:IB_RUN_ID)
}
function Write-Event([string]$Action,[string]$Result) {
    $dir = Get-LogDirectory; Assert-PrivateAcl $dir
    $file = Join-Path $dir 'events.log'; Assert-NoReparse $file
    # Eventos fixos; nunca stdout/stderr, .env, HTTP, CommandLine ou Exception.Message.
    Add-Content -LiteralPath $file -Value ('{0:u} action={1} result={2}' -f [DateTime]::UtcNow,$Action,$Result) -Encoding UTF8
}
function Get-AppRoot {
    if ($env:IB_RUN_ID.StartsWith('uninstall-')) { return Assert-App $env:APP_DIR }
    return Assert-App $env:TARGET_DIR
}
function Get-AppPort([string]$Root) {
    $file = Join-Path $Root '.env'; Assert-NoReparse $file
    $lines = @(Get-Content -LiteralPath $file -ErrorAction Stop | Where-Object { $_ -match '^\s*PORT\s*=' })
    if ($lines.Count -ne 1 -or $lines[0] -notmatch '^\s*PORT\s*=\s*[''"]?([0-9]{1,5})[''"]?\s*(?:#.*)?$') { throw 'PORT_INVALID' }
    $number = [int]$Matches[1]
    if ($number -lt 1 -or $number -gt 65535) { throw 'PORT_RANGE' }
    return $number
}
function Get-ServiceExecutable([string]$Command) {
    if ($Command -match '^\s*"([^"]+\.exe)"(?:\s|$)') { return [IO.Path]::GetFullPath($Matches[1]) }
    if ($Command -match '^\s*([^\s"]+\.exe)(?:\s|$)') { return [IO.Path]::GetFullPath($Matches[1]) }
    throw 'SERVICE_COMMAND_AMBIGUOUS'
}
function Get-OwnedServices([string]$Root) {
    foreach ($name in @('infoboardtv.exe','infoboardservice.exe','InfoboardService','Infoboard TV')) {
        foreach ($svc in @(Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $name) -ErrorAction Stop)) {
            $exe = Get-ServiceExecutable $svc.PathName
            if ($exe -notin @((Join-Path $Root 'daemon\infoboardtv.exe'),(Join-Path $Root 'daemon\infoboardservice.exe'))) { throw 'SERVICE_OTHER_INSTALLATION' }
            Assert-NoReparse $exe
            if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'SERVICE_EXECUTABLE_MISSING' }
            $svc
        }
    }
}
function Stop-OwnedServices([string]$Root) {
    $null = Assert-App $Root
    foreach ($svc in @(Get-OwnedServices $Root)) {
        $current = Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $svc.Name)
        if ($current.PathName -cne $svc.PathName) { throw 'SERVICE_CHANGED' }
        if ($current.State -ne 'Stopped') {
            Stop-Service -Name $svc.Name -ErrorAction Stop
            (Get-Service -Name $svc.Name).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(20))
        }
        if ((Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $svc.Name)).State -ne 'Stopped') { throw 'SERVICE_NOT_STOPPED' }
    }
}
function Assert-NoAppProcesses([string]$Root) {
    $server = Join-Path $Root 'server.js'
    $pattern = '(?i)(?:^|\s)(?:"'+[regex]::Escape($server)+'"|'+[regex]::Escape($server)+')(?:\s|$)'
    foreach ($proc in @(Get-CimInstance Win32_Process -ErrorAction Stop)) {
        if (($proc.ExecutablePath -and (Test-Within $proc.ExecutablePath $Root)) -or ($proc.CommandLine -and $proc.CommandLine -match $pattern)) { throw 'APP_PROCESS_STILL_RUNNING' }
    }
}
function Remove-OwnedServices([string]$Root) {
    Stop-OwnedServices $Root
    foreach ($svc in @(Get-OwnedServices $Root)) {
        $current = Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $svc.Name)
        if ($current.PathName -cne $svc.PathName -or $current.State -ne 'Stopped') { throw 'SERVICE_CHANGED_BEFORE_DELETE' }
        & "$env:SystemRoot\System32\sc.exe" delete $svc.Name >$null 2>&1
        $rc = $LASTEXITCODE; Write-Event 'ServiceDelete' ([string]$rc)
        if ($rc -ne 0) { throw 'SERVICE_DELETE_EXIT' }
        for ($i=0;$i -lt 10;$i++) {
            if (-not (Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $svc.Name))) { break }
            Start-Sleep -Milliseconds 500
        }
        if (Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $svc.Name)) { throw 'SERVICE_DELETE_PENDING' }
    }
    Assert-NoAppProcesses $Root
}
function Get-FirewallName([string]$Root) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Root.ToLowerInvariant()))).Replace('-','') } finally { $sha.Dispose() }
    return 'InfoBoard-'+$hash.Substring(0,24)
}
function Set-AppFirewall([string]$Root) {
    $number = Get-AppPort $Root; $name = Get-FirewallName $Root; $group = 'InfoBoard:'+$Root
    $exe = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source; Assert-NoReparse $exe
    $rule = Get-NetFirewallRule -PolicyStore PersistentStore -ErrorAction Stop | Where-Object Name -EQ $name
    if ($rule) {
        if ($rule.Group -cne $group) { throw 'FIREWALL_OWNER' }
        Set-NetFirewallRule -Name $name -PolicyStore PersistentStore -Enabled True -Direction Inbound -Action Allow -Protocol TCP -LocalPort $number -Program $exe -ErrorAction Stop | Out-Null
    } else {
        New-NetFirewallRule -Name $name -DisplayName ('Infoboard TV - TCP '+$number) -Group $group -Direction Inbound -Enabled True -LocalPort $number -Protocol TCP -Program $exe -Action Allow -ErrorAction Stop | Out-Null
    }
    $rule = Get-NetFirewallRule -Name $name -PolicyStore PersistentStore -ErrorAction Stop
    $filter = $rule | Get-NetFirewallPortFilter -ErrorAction Stop; $app = $rule | Get-NetFirewallApplicationFilter -ErrorAction Stop
    if ($rule.Enabled -ne 'True' -or $rule.Action -ne 'Allow' -or $rule.Direction -ne 'Inbound' -or $rule.Group -cne $group -or $filter.LocalPort -ne "$number" -or $filter.Protocol -notin @('TCP','6') -or $app.Program -ine $exe) { throw 'FIREWALL_VERIFY' }
}
function Remove-AppFirewall([string]$Root) {
    $name = Get-FirewallName $Root
    foreach ($rule in @(Get-NetFirewallRule -PolicyStore PersistentStore -ErrorAction Stop | Where-Object Name -EQ $name)) {
        if ($rule.Group -cne ('InfoBoard:'+$Root)) { throw 'FIREWALL_OWNER' }
        $rule | Remove-NetFirewallRule -ErrorAction Stop
    }
    if (Get-NetFirewallRule -PolicyStore PersistentStore -ErrorAction Stop | Where-Object Name -EQ $name) { throw 'FIREWALL_REMOVE_VERIFY' }
}
function Test-OwnedShortcut([string]$File,[string]$Root,$Shell) {
    Assert-NoReparse $File
    if ([IO.Path]::GetExtension($File) -ieq '.url') {
        $marker = @(Get-Content -LiteralPath $File | Where-Object { $_.StartsWith('InfoBoardAppDir=') })
        return $marker.Count -eq 1 -and $marker[0].Substring(16).Equals($Root,[StringComparison]::OrdinalIgnoreCase)
    }
    $target = $Shell.CreateShortcut($File).TargetPath
    return $target -and [IO.Path]::IsPathRooted($target) -and (Test-Within $target $Root)
}
function Update-AppShortcuts([string]$Root,[bool]$Remove) {
    $shell = New-Object -ComObject WScript.Shell
    $desktops = @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('CommonDesktopDirectory')) | Select-Object -Unique
    foreach ($desktop in $desktops) {
        if (-not $desktop -or -not (Test-Path -LiteralPath $desktop -PathType Container)) { continue }
        Assert-NoReparse $desktop
        $names = @('Abrir Painel Infoboard.url','Atualizar Infoboard.lnk')
        if ($Remove) { $names += @('Infoboard TV.lnk','Infoboard TV.url') }
        foreach ($name in $names) {
            $file = Join-Path $desktop $name; $exists = Test-Path -LiteralPath $file
            if ($exists -and -not (Test-OwnedShortcut $file $Root $shell)) { if ($Remove) { continue }; throw 'SHORTCUT_OTHER_INSTALLATION' }
            if ($Remove) {
                if ($exists) { Remove-Item -LiteralPath $file -Force -ErrorAction Stop; if (Test-Path -LiteralPath $file) { throw 'SHORTCUT_REMOVE_VERIFY' } }
            } elseif ($name.EndsWith('.url')) {
                $url = 'http://localhost:'+(Get-AppPort $Root)
                [IO.File]::WriteAllLines($file,@('[InternetShortcut]',('URL='+$url),('InfoBoardAppDir='+$Root)),[Text.Encoding]::UTF8)
                if (-not (Test-OwnedShortcut $file $Root $shell) -or (Get-Content -LiteralPath $file) -notcontains ('URL='+$url)) { throw 'SHORTCUT_URL_VERIFY' }
            } else {
                $target = Join-Path $Root 'instalador\ATUALIZAR_INFOBOARD.bat'; Assert-NoReparse $target
                if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw 'UPDATER_MISSING' }
                $link = $shell.CreateShortcut($file); $link.TargetPath = $target; $link.WorkingDirectory = Split-Path -Parent $target; $link.Save()
                if (-not (Test-OwnedShortcut $file $Root $shell)) { throw 'SHORTCUT_LINK_VERIFY' }
            }
        }
    }
}
function Backup-AppData([string]$Root) {
    Assert-Tree $Root
    $backup = Join-Path $env:LOCALAPPDATA ('Infoboard\backups\'+$env:IB_RUN_ID)
    if ((Test-Within $backup $Root) -or (Test-Within $Root $backup)) { throw 'BACKUP_INSIDE_APP' }
    New-PrivateDirectory $backup
    $selected = @()
    foreach ($name in @('.env','config','data')) {
        $source = Join-Path $Root $name
        if (Test-Path -LiteralPath $source) { $selected += Get-Item -LiteralPath $source -Force }
    }
    $selected += @(Get-ChildItem -LiteralPath $Root -File -Force | Where-Object { $_.Name -match '\.(db|sqlite|sqlite3)(-(wal|shm))?$|\.env|state.*\.json$' })
    $copied = @{}
    foreach ($item in $selected) {
        $entries = @($item)
        if ($item.PSIsContainer) { $entries += @(Get-ChildItem -LiteralPath $item.FullName -Recurse -Force) }
        foreach ($entry in $entries) {
            $relative = $entry.FullName.Substring($Root.Length).TrimStart('\')
            if ($copied.ContainsKey($relative)) { continue }
            $dest = Join-Path $backup $relative; Assert-NoReparse $entry.FullName; Assert-NoReparse $dest
            if ($entry.PSIsContainer) { [IO.Directory]::CreateDirectory($dest) | Out-Null } else {
                [IO.Directory]::CreateDirectory((Split-Path -Parent $dest)) | Out-Null
                [IO.File]::WriteAllBytes($dest,[IO.File]::ReadAllBytes($entry.FullName))
                if ((Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash -cne (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash) { throw 'BACKUP_HASH' }
            }
            Assert-PrivateAcl $dest; $copied[$relative] = $true
        }
    }
    $complete = Join-Path $backup 'backup.complete'
    Assert-NoReparse $complete
    [IO.File]::WriteAllText($complete,'INFOBOARD_BACKUP_VERIFIED',[Text.Encoding]::UTF8)
    Assert-PrivateAcl $complete
    [Console]::WriteLine('Backup privado verificado em: '+$backup)
}
function Copy-AppSource {
    $target = Assert-TargetRoot $env:TARGET_DIR
    if (Test-Path -LiteralPath $target) { Assert-Tree $target; if (@(Get-ChildItem -LiteralPath $target -Force).Count) { $null = Assert-App $target } }
    $source = $null
    foreach ($candidate in @((Split-Path -Parent (Split-Path -Parent $env:IB_SCRIPT)),(Split-Path -Parent $env:IB_SCRIPT))) {
        if (Test-Path -LiteralPath (Join-Path $candidate 'server.js')) { $source = Assert-App $candidate; Assert-Tree $source; break }
    }
    if ($source -and $source.Equals($target,[StringComparison]::OrdinalIgnoreCase)) { return }
    if ($source -and ((Test-Within $target $source) -or (Test-Within $source $target))) { throw 'SOURCE_TARGET_OVERLAP' }
    if (-not $source) {
        $stage = Join-Path $env:LOCALAPPDATA ('Infoboard\source-staging\'+$env:IB_RUN_ID)
        if ((Test-Within $stage $target) -or (Test-Within $target $stage)) { throw 'STAGE_OVERLAP' }
        New-PrivateDirectory $stage; $zip = Join-Path $stage 'source.zip'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri 'https://github.com/JSDavi/Infoboard/archive/refs/heads/master.zip' -OutFile $zip -UseBasicParsing
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $archive = [IO.Compression.ZipFile]::OpenRead($zip)
        try {
            foreach ($entry in $archive.Entries) {
                $entryPath = [IO.Path]::GetFullPath((Join-Path $stage $entry.FullName))
                if (-not (Test-Within $entryPath $stage) -or $entry.FullName -match '(^|[/\\])\.\.([/\\]|$)' -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) { throw 'ZIP_UNSAFE' }
            }
        } finally { $archive.Dispose() }
        [IO.Compression.ZipFile]::ExtractToDirectory($zip,$stage)
        $source = Assert-App (Join-Path $stage 'Infoboard-master'); Assert-Tree $source
        # Staging privado preservado para diagnostico, sem limpeza recursiva.
    }
    [IO.Directory]::CreateDirectory($target) | Out-Null; Assert-Tree $target
    # Preservar mapa existente; novas instalacoes recebem o mapa da fonte.
    $excludes = @('.env','.env.*','*.env*','*.log')
    if (Test-Path -LiteralPath (Join-Path $target 'config\analysts_map.json')) { $excludes += Join-Path $source 'config\analysts_map.json' }
    # Qualquer falha do Robocopy encerra a operacao; sem outro canal de copia.
    & robocopy.exe $source $target /E /XJ /XJD /XJF /NP /NFL /NDL /R:0 /W:0 /XD node_modules .git .git_old .maestri .agents backups (Join-Path $source 'docs\auditoria') /XF $excludes >$null 2>&1
    $rc = $LASTEXITCODE
    Write-Event 'Robocopy' ([string]$rc)
    if ($rc -lt 0 -or $rc -ge 8) { throw 'ROBOCOPY_FAILED' }
    $null = Assert-App $target; Assert-Tree $target
}
function Verify-Service([string]$Root) {
    $number = Get-AppPort $Root
    for ($i=0;$i -lt 20;$i++) {
        $services = @(Get-OwnedServices $Root); $running = @($services | Where-Object { $_.State -eq 'Running' -and $_.StartMode -eq 'Auto' })
        if ($running.Count) { break }; Start-Sleep -Milliseconds 500
    }
    if (-not $running.Count) { throw 'SERVICE_VERIFY_RUNNING_AUTO' }
    $ownedIds = @($running.ProcessId | Where-Object { $_ -gt 0 })
    if (-not $ownedIds.Count) { throw 'SERVICE_PID_INVALID' }
    for ($i=0;$i -lt 5;$i++) { $children = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -in $ownedIds }); $ownedIds += @($children.ProcessId) }
    $connections = @(Get-NetTCPConnection -State Listen -LocalPort $number -ErrorAction Stop)
    if (-not @($connections | Where-Object { $_.OwningProcess -in $ownedIds }).Count) { throw 'PORT_OTHER_PROCESS' }
    $response = Invoke-WebRequest -Uri ('http://127.0.0.1:'+$number+'/') -UseBasicParsing -TimeoutSec 10
    if ($response.StatusCode -ne 200) { throw 'HTTP_STATUS' }
    [Console]::WriteLine('Servico automatico em execucao e HTTP verificado na porta '+$number)
}
function Remove-AppFiles([string]$Root) {
    if ($env:UNINST_MODE -ne '2' -or $env:IB_RUN_ID -notmatch '^uninstall-[0-9]+-[0-9]+$') { throw 'DELETE_MODE_INVALID' }
    $backup = Join-Path $env:LOCALAPPDATA ('Infoboard\backups\'+$env:IB_RUN_ID)
    Assert-PrivateAcl $backup
    $complete = Join-Path $backup 'backup.complete'
    Assert-PrivateAcl $complete
    if ([IO.File]::ReadAllText($complete) -cne 'INFOBOARD_BACKUP_VERIFIED') { throw 'BACKUP_NOT_COMPLETE' }
    $target = Assert-App $Root; Assert-Tree $target
    if (@(Get-OwnedServices $target).Count) { throw 'SERVICES_REMAIN' }
    Assert-NoAppProcesses $target
    # Validacao repetida imediatamente antes do unico Remove-Item recursivo.
    $null = Assert-TargetRoot $target; Assert-Tree $target
    Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop
    if (Test-Path -LiteralPath $target) { throw 'DELETE_NOT_COMPLETE' }
}
function Finish-FromPrivateHost([string]$Root) {
    $null = Assert-App $Root
    $dir = Get-LogDirectory; Assert-PrivateAcl $dir
    $hostBat = Join-Path $dir 'DESINSTALAR_INFOBOARD.bat'
    Assert-NoReparse $env:IB_SCRIPT; Assert-NoReparse $hostBat
    if (Test-Path -LiteralPath $hostBat) { throw 'HOST_EXISTS' }
    [IO.File]::WriteAllBytes($hostBat,[IO.File]::ReadAllBytes($env:IB_SCRIPT))
    Assert-PrivateAcl $hostBat
    if ((Get-FileHash -LiteralPath $hostBat -Algorithm SHA256).Hash -cne (Get-FileHash -LiteralPath $env:IB_SCRIPT -Algorithm SHA256).Hash) { throw 'HOST_HASH' }
    if ((Test-Within $hostBat $Root) -or -not (Test-Within $hostBat $dir)) { throw 'HOST_INSIDE_APP' }
    & $env:ComSpec /d /c ('""'+$hostBat+'" --finish-files"')
    if ($LASTEXITCODE -ne 0) { throw 'HOST_DELETE_NOT_CONFIRMED' }
}
# INFOBOARD_DISPATCH
$action = $env:IB_ACTION
$allowedActions = @('InitLog','LogFailure','CopySource','ValidateApp','Backup','StopServices','RemoveServices','FirewallInstall','FirewallRemove','ShortcutsInstall','ShortcutsRemove','VerifyService','RemoveFiles','ReadPort','FinishFromPrivateHost')
if ($action -notin $allowedActions) { [Console]::Error.WriteLine('Acao invalida.'); exit 1 }
try {
    # Confirmar log privado antes de qualquer operacao, inclusive exclusao.
    if ($action -ne 'InitLog') { Write-Event $action 'START' }
    if ($action -eq 'InitLog') { New-PrivateDirectory (Get-LogDirectory) }
    elseif ($action -eq 'LogFailure') {
        if ($env:IB_ERR_CODE -notmatch '^[0-9]{3}$') { throw 'ERROR_CODE' }
        Write-Event $action $env:IB_ERR_CODE
        if ($env:IB_NATIVE_EXIT -match '^-?[0-9]{1,10}$') { Write-Event 'NativeExit' $env:IB_NATIVE_EXIT }
        exit 0
    } elseif ($action -eq 'CopySource') { Copy-AppSource }
    else {
        $appRoot = Get-AppRoot
        switch ($action) {
            'ValidateApp' { }
            'ReadPort' { [Console]::WriteLine((Get-AppPort $appRoot)) }
            'Backup' { Backup-AppData $appRoot }
            'StopServices' { Stop-OwnedServices $appRoot }
            'RemoveServices' { Remove-OwnedServices $appRoot }
            'FirewallInstall' { Set-AppFirewall $appRoot }
            'FirewallRemove' { Remove-AppFirewall $appRoot }
            'ShortcutsInstall' { Update-AppShortcuts $appRoot $false }
            'ShortcutsRemove' { Update-AppShortcuts $appRoot $true }
            'VerifyService' { Verify-Service $appRoot }
            'RemoveFiles' { Remove-AppFiles $appRoot }
            'FinishFromPrivateHost' { Finish-FromPrivateHost $appRoot }
        }
    }
    Write-Event $action 'OK'; exit 0
} catch {
    try { Write-Event $action 'FAIL' } catch { }
    [Console]::Error.WriteLine('[FALHA] Etapa '+$action+' nao confirmada. Operacao interrompida; consulte o log privado.')
    exit 1
}
