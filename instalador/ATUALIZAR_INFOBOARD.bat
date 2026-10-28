@echo off
setlocal DisableDelayedExpansion
set "ERRORLEVEL="
title InfoBoard - Atualizador
set "IB_UPDATER_SELF=%~f0"
(
powershell.exe -NoLogo -NoProfile -Command "$text=[IO.File]::ReadAllText($env:IB_UPDATER_SELF); $start=$text.IndexOf([Environment]::NewLine+'# INFOBOARD_PAYLOAD_BEGIN'); $end=$text.LastIndexOf([Environment]::NewLine+'# INFOBOARD_PAYLOAD_END'); if($start -lt 0 -or $end -le $start){Write-Host 'FALHA: arquivo incompleto.'; exit 1}; $code=$text.Substring($start,$end-$start); . ([scriptblock]::Create($code)); exit (Start-IBUpdater $env:IB_UPDATER_SELF)"
call exit /b %%errorlevel%%
)
# INFOBOARD_PAYLOAD_BEGIN
# Windows PowerShell 5.1; source for embedding inside the autonomous BATs.
# Loading this file only defines functions. No updater-core dependency.
# Public contract: Invoke-IBEnsureNode -LogDirectory <absolute directory>
# returns exactly { NodePath; NpmPath; RebootRequired }, or throws.
# Adapters are optional trusted scriptblocks for tests; omitted keys use defaults.

function IBNodeAssertAbsolute([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path) -or $Path -match '[\x00-\x1f"]' -or
        $Path -notmatch '^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+[\\/])') {
        throw 'Node: informe um caminho absoluto valido.'
    }
    return [IO.Path]::GetFullPath($Path)
}

function IBNodeAssertNoReparse([string]$Path) {
    $walk = IBNodeAssertAbsolute $Path
    while ($walk) {
        if (Test-Path -LiteralPath $walk -ErrorAction Stop) {
            $item = Get-Item -LiteralPath $walk -Force -ErrorAction Stop
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw 'Node: reparse point no destino ou ancestral.'
            }
        }
        $parent = [IO.Path]::GetDirectoryName($walk)
        if ($parent -eq $walk) { break }
        $walk = $parent
    }
}

function IBNodeProtectDirectory([string]$Path) {
    IBNodeAssertNoReparse $Path
    if (-not (Test-Path -LiteralPath $Path -ErrorAction Stop)) {
        $null = New-Item -ItemType Directory -Path $Path -ErrorAction Stop
    }
    IBNodeAssertNoReparse $Path
    if (-not (Get-Item -LiteralPath $Path -Force -ErrorAction Stop).PSIsContainer) {
        throw 'Node: destino dos logs deve ser uma pasta.'
    }
    $ids = @([Security.Principal.WindowsIdentity]::GetCurrent().User,
        [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))
    $ids = @($ids | Sort-Object -Property Value -Unique)
    $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) { $null = $acl.RemoveAccessRuleSpecific($rule) }
    foreach ($id in $ids) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
            $id, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
    }
    Set-Acl -LiteralPath $Path -AclObject $acl -ErrorAction Stop
    $check = Get-Acl -LiteralPath $Path -ErrorAction Stop
    $rules = @($check.Access)
    if (-not $check.AreAccessRulesProtected -or $rules.Count -ne $ids.Count) {
        throw 'Node: ACL privada nao confirmada.'
    }
    $seen = @()
    foreach ($rule in $rules) {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($ids.Value -notcontains $sid -or $seen -contains $sid -or $rule.IsInherited -or
            $rule.AccessControlType -ne 'Allow' -or $rule.FileSystemRights -ne 'FullControl' -or
            $rule.InheritanceFlags -ne 'ContainerInherit, ObjectInherit' -or
            $rule.PropagationFlags -ne 'None') {
            throw 'Node: ACL privada divergente.'
        }
        $seen += $sid
    }
    IBNodeAssertNoReparse $Path
}

function IBNodeFetch([string]$Url, [string]$Destination) {
    $uri = [Uri]$Url
    if ($uri.Scheme -ne 'https' -or $uri.DnsSafeHost -ne 'nodejs.org' -or
        $uri.Port -ne 443 -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) {
        throw 'Node: origem de download nao autorizada.'
    }
    IBNodeAssertNoReparse $Destination
    $previousTls = [Net.ServicePointManager]::SecurityProtocol
    $response = $null
    $file = $null
    $inputStream = $null
    try {
        [Net.ServicePointManager]::SecurityProtocol = $previousTls -bor [Net.SecurityProtocolType]::Tls12
        $request = [Net.HttpWebRequest]::Create($uri)
        # Refuse redirects, including redirects to another host or to HTTP.
        $request.AllowAutoRedirect = $false
        $request.Timeout = 120000
        $request.ReadWriteTimeout = 120000
        $response = $request.GetResponse()
        if ([int]$response.StatusCode -ne 200) { throw 'Node: HTTP inesperado.' }
        $inputStream = $response.GetResponseStream()
        $file = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew,
            [IO.FileAccess]::Write, [IO.FileShare]::None)
        $inputStream.CopyTo($file)
    } finally {
        if ($file) { $file.Dispose() }
        if ($inputStream) { $inputStream.Dispose() }
        if ($response) { $response.Dispose() }
        [Net.ServicePointManager]::SecurityProtocol = $previousTls
    }
}

function IBNodeDefaultAdapters {
    return @{
        Candidates = {
            @(Get-Command node.exe -CommandType Application -All -ErrorAction SilentlyContinue |
                ForEach-Object { $_.Source })
            foreach ($base in @($env:ProgramW6432, $env:ProgramFiles)) {
                if ($base) { Join-Path $base 'nodejs\node.exe' }
            }
        }
        FileExists = { param($p) Test-Path -LiteralPath $p -PathType Leaf -ErrorAction Stop }
        Version = {
            param($p)
            $version = & $p --version 2>$null
            if ($LASTEXITCODE -eq 0) { return ($version -join "`n").Trim() }
            return ''
        }
        NpmVersion = {
            param($p)
            $version = & $p --version 2>$null
            if ($LASTEXITCODE -eq 0) { return ($version -join "`n").Trim() }
            return ''
        }
        InstallDirectory = {
            $base = $env:ProgramW6432
            if (-not $base) { $base = $env:ProgramFiles }
            if (-not $base) { throw 'Node: Program Files indisponivel.' }
            Join-Path $base 'nodejs'
        }
        Architecture = {
            # Native OS architecture, even under x86/x64 emulation.
            $arch = $env:PROCESSOR_ARCHITEW6432
            if (-not $arch) { $arch = $env:PROCESSOR_ARCHITECTURE }
            switch ($arch) {
                'AMD64' { return 'x64' }
                'ARM64' { return 'arm64' }
                default { throw 'Node: arquitetura nao suportada.' }
            }
        }
        AssertNoReparse = { param($p) IBNodeAssertNoReparse $p }
        ProtectDirectory = { param($p) IBNodeProtectDirectory $p }
        Fetch = { param($url, $p) IBNodeFetch $url $p }
        ReadText = { param($p) Get-Content -LiteralPath $p -Raw -ErrorAction Stop }
        Hash = { param($p) (Get-FileHash -LiteralPath $p -Algorithm SHA256 -ErrorAction Stop).Hash }
        Signature = { param($p) Get-AuthenticodeSignature -LiteralPath $p -ErrorAction Stop }
        Install = {
            param($msi, $log)
            # Error-only MSI log: never dump environment, secrets or verbose properties.
            # No elevation retry, policy bypass, transcript, or machine PATH write.
            $exe = Join-Path ([Environment]::GetFolderPath('System')) 'msiexec.exe'
            $arguments = '/i "{0}" /qn /norestart REBOOT=ReallySuppress /Le "{1}"' -f $msi, $log
            $process = Start-Process -FilePath $exe -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden -ErrorAction Stop
            return $process.ExitCode
        }
        RefreshPath = {
            param($preferredDirectory)
            $parts = @($preferredDirectory,
                [Environment]::GetEnvironmentVariable('Path', 'Machine'),
                [Environment]::GetEnvironmentVariable('Path', 'User'), $env:Path)
            $entries = @()
            foreach ($part in $parts) {
                foreach ($entry in ($part -split ';')) {
                    if ($entry -and $entries -notcontains $entry) { $entries += $entry }
                }
            }
            $env:Path = $entries -join ';'
        }
    }
}

function IBNodeFindRuntime([hashtable]$Adapters) {
    foreach ($candidate in @(& $Adapters.Candidates)) {
        if (-not $candidate) { continue }
        # Ignore relative/foreign command shims; never execute them.
        if ($candidate -notmatch '^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+[\\/])' -or
            [IO.Path]::GetFileName($candidate) -ine 'node.exe') { continue }
        $node = IBNodeAssertAbsolute $candidate
        $npm = [IO.Path]::Combine([IO.Path]::GetDirectoryName($node), 'npm.cmd')
        if (-not (& $Adapters.FileExists $node) -or -not (& $Adapters.FileExists $npm)) { continue }
        $version = & $Adapters.Version $node
        $parsed = $null
        if ($version -cmatch '^v?(\d+)\.(\d+)\.(\d+)$' -and
            [version]::TryParse($version.TrimStart('v'), [ref]$parsed) -and $parsed -ge [version]'22.0.0' -and
            (& $Adapters.NpmVersion $npm) -match '^\d+\.\d+\.\d+$') {
            return [pscustomobject]@{ NodePath = $node; NpmPath = $npm; RebootRequired = $false }
        }
    }
    return $null
}

function IBNodeReport([string]$Stage, [string]$Log, $Code) {
    $status = if ($null -eq $Code) { 'nao executado' } else { [string]$Code }
    $location = if ($Log) { $Log } else { 'ainda nao criado' }
    Write-Host ('[Node] Etapa: {0}; MSI: {1}; log: {2}' -f $Stage, $status, $location)
}

function Invoke-IBEnsureNode {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$LogDirectory,
        [hashtable]$Adapters = @{}
    )
    $ErrorActionPreference = 'Stop'
    $stage = 'validacao'
    $log = $null
    $exitCode = $null
    try {
        $actions = IBNodeDefaultAdapters
        foreach ($key in $Adapters.Keys) {
            if (-not $actions.ContainsKey($key) -or $Adapters[$key] -isnot [scriptblock]) {
                throw 'Node: adapter invalido.'
            }
            $actions[$key] = $Adapters[$key]
        }
        $logRoot = IBNodeAssertAbsolute $LogDirectory
        $runtime = IBNodeFindRuntime $actions
        if ($runtime) {
            IBNodeReport 'runtime adequado preservado' $null $null
            return $runtime
        }

        $stage = 'arquitetura'
        IBNodeReport $stage $log $exitCode
        $arch = & $actions.Architecture
        if ($arch -notin @('x64', 'arm64')) { throw 'Node: arquitetura nao suportada.' }
        $installDirectory = IBNodeAssertAbsolute (& $actions.InstallDirectory)
        $stage = 'protecao dos logs'
        IBNodeReport $stage $log $exitCode
        $null = & $actions.AssertNoReparse $logRoot
        $null = & $actions.ProtectDirectory $logRoot
        $null = & $actions.AssertNoReparse $logRoot
        $work = Join-Path $logRoot ('node-' + [Guid]::NewGuid().ToString('N'))
        $null = & $actions.ProtectDirectory $work
        $null = & $actions.AssertNoReparse $work

        # Official LTS release, verified 2026-10-25:
        # https://github.com/nodejs/node/releases/tag/v24.22.1 (2026-10-21).
        $release = 'v24.22.1'
        $name = 'node-' + $release + '-' + $arch + '.msi'
        $origin = 'https://nodejs.org/dist/' + $release + '/'
        $msi = Join-Path $work $name
        $sums = Join-Path $work 'SHASUMS256.txt'
        $log = Join-Path $work 'node-msi.log'
        foreach ($p in @($msi, $sums, $log)) { $null = & $actions.AssertNoReparse $p }
        $stage = 'download oficial'
        IBNodeReport $stage $log $exitCode
        $null = & $actions.Fetch ($origin + 'SHASUMS256.txt') $sums
        $null = & $actions.Fetch ($origin + $name) $msi
        $stage = 'SHA256'
        IBNodeReport $stage $log $exitCode
        $lines = @((& $actions.ReadText $sums) -split '\r?\n' |
            Where-Object { $_ -cmatch ('^([a-fA-F0-9]{64})[ \t]+\*?' + [regex]::Escape($name) + '$') })
        if ($lines.Count -ne 1) { throw 'Node: checksum ausente, ambiguo ou invalido.' }
        $expected = ($lines[0] -split '[ \t]+')[0]
        $actual = & $actions.Hash $msi
        if ($actual -notmatch '^[a-fA-F0-9]{64}$' -or $actual -ine $expected) { throw 'Node: SHA256 divergente.' }
        $stage = 'Authenticode OpenJS Foundation'
        IBNodeReport $stage $log $exitCode
        $signature = & $actions.Signature $msi
        if (-not $signature -or $signature.Status -ne 'Valid' -or -not $signature.SignerCertificate -or
            $signature.SignerCertificate.Subject -notmatch '(?:^|,\s*)O\s*=\s*(?:"OpenJS Foundation"|OpenJS Foundation)\s*(?:,|$)') {
            throw 'Node: assinatura OpenJS Foundation invalida.'
        }
        # Recheck every destination immediately before handing it to Windows Installer.
        $stage = 'protecao antes do MSI'
        IBNodeReport $stage $log $exitCode
        $null = & $actions.ProtectDirectory $logRoot
        $null = & $actions.ProtectDirectory $work
        foreach ($p in @($msi, $sums, $log)) { $null = & $actions.AssertNoReparse $p }
        $stage = 'MSI'
        IBNodeReport $stage $log $exitCode
        $rawCode = & $actions.Install $msi $log
        $parsedCode = 0
        if ($null -eq $rawCode -or -not [int]::TryParse([string]$rawCode, [ref]$parsedCode)) {
            throw 'Node: Windows Installer nao retornou um codigo.'
        }
        $exitCode = $parsedCode
        IBNodeReport 'resultado MSI' $log $exitCode
        if ($exitCode -notin @(0, 3010, 1641)) {
            throw 'Node: Windows Installer falhou.'
        }
        $stage = 'validacao apos MSI'
        IBNodeReport $stage $log $exitCode
        $null = & $actions.RefreshPath $null
        if ($exitCode -in @(3010, 1641)) {
            # Do not probe a potentially half-replaced executable before reboot.
            # These are expected MSI paths, not a claim that they are usable yet.
            IBNodeReport 'reinicie o Windows antes de continuar; runtime pendente' $log $exitCode
            return [pscustomobject]@{
                NodePath = Join-Path $installDirectory 'node.exe'
                NpmPath = Join-Path $installDirectory 'npm.cmd'
                RebootRequired = $true
            }
        }
        $runtime = IBNodeFindRuntime $actions
        if (-not $runtime) { throw 'Node: runtime indisponivel apos MSI.' }
        $null = & $actions.RefreshPath ([IO.Path]::GetDirectoryName($runtime.NodePath))
        return $runtime
    } catch {
        # Do not print exception payloads, environment, proxy credentials or command output.
        # A denial is terminal: there is no alternate download/elevation/retry path.
        IBNodeReport ('falha em ' + $stage + '; operacao interrompida') $log $exitCode
        $status = if ($null -eq $exitCode) { 'nao executado' } else { [string]$exitCode }
        $location = if ($log) { $log } else { 'ainda nao criado' }
        throw [InvalidOperationException]::new(
            ('Node: falha em {0}; MSI: {1}; log: {2}; operacao interrompida.' -f $stage, $status, $location))
    }
}

# Migracao restrita ao endereco legado confirmado do PBX; outras URLs sao preservadas.
function Convert-IBPbxConfigText([string]$Text) {
    $pattern = '(?m)^(?<prefix>[ \t]*(?:export[ \t]+)?PBX_BASE_URL[ \t]*=[ \t]*)(?<quote>["'']?)(?i:https://pbx\.nossatelecom\.com\.br)/?\k<quote>(?<suffix>[ \t]*(?:#[^\r\n]*)?)(?=\r?$)'
    return [regex]::Replace($Text, $pattern, '${prefix}${quote}https://sip33.tsinfo.net.br${quote}${suffix}')
}

# Usado pelos instaladores. O atualizador usa seu proprio backup privado/rollback.
function Invoke-IBPbxInstallMigration([string]$Root) {
    $ErrorActionPreference = 'Stop'
    $file = Join-Path $Root '.env'
    $text = [IO.File]::ReadAllText($file)
    $updated = Convert-IBPbxConfigText $text
    if ($updated -ceq $text) { return }
    $backup = $file + '.pbx-backup-' + [guid]::NewGuid().ToString('N')
    foreach ($target in @($file, $backup)) {
        $probe = [IO.Path]::GetFullPath($target)
        while ($probe) {
            if ((Test-Path -LiteralPath $probe) -and ((Get-Item -LiteralPath $probe -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Link ou junction recusado.' }
            $probe = [IO.Path]::GetDirectoryName($probe)
        }
        if (-not [IO.File]::Exists($target)) { [IO.File]::WriteAllBytes($target, @()) }
        $acl = [Security.AccessControl.FileSecurity]::new()
        $acl.SetAccessRuleProtection($true, $false)
        $sids = @([Security.Principal.WindowsIdentity]::GetCurrent().User, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))
        foreach ($sid in $sids) { $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'Allow')) }
        Set-Acl -LiteralPath $target -AclObject $acl
        $check = Get-Acl -LiteralPath $target
        if (-not $check.AreAccessRulesProtected -or @($check.Access).Count -ne 2) { throw 'Permissoes privadas PBX nao confirmadas.' }
        foreach ($rule in $check.Access) {
            if ($rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($sids.Value) -or
                $rule.IsInherited -or $rule.AccessControlType -ne 'Allow' -or
                ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl) { throw 'Permissoes privadas PBX invalidas.' }
        }
    }
    [IO.File]::WriteAllBytes($backup, [IO.File]::ReadAllBytes($file))
    $bom = [IO.File]::ReadAllBytes($file)
    $hasBom = $bom.Length -ge 3 -and $bom[0] -eq 239 -and $bom[1] -eq 187 -and $bom[2] -eq 191
    [IO.File]::WriteAllText($file, $updated, [Text.UTF8Encoding]::new($hasBom))
    Write-Host 'PBX: endereco legado corrigido; backup privado criado.'
}

# Fonte do payload embutido em ATUALIZAR_INFOBOARD.bat. Windows PowerShell 5.1.
# Gerar novamente com: node scripts/build-installers.cjs
Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'

function Assert-IBPath([string]$Path) {
    if (-not $Path -or -not [IO.Path]::IsPathRooted($Path)) { throw 'Informe um caminho absoluto.' }
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\','/')
    $walk = $full
    while ($walk) {
        if ((Test-Path -LiteralPath $walk) -and ((Get-Item -LiteralPath $walk -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Link ou junction encontrado; revise o caminho antes de continuar.' }
        $walk = [IO.Path]::GetDirectoryName($walk)
    }
    return $full
}

function Get-IBTarget([string]$Root, [string]$Relative) {
    $target = Assert-IBPath ([IO.Path]::GetFullPath((Join-Path $Root $Relative)))
    if (-not $target.StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Caminho fora da pasta autorizada.' }
    return $target
}

function Protect-IBPath([string]$Path, [switch]$Directory) {
    $p = Assert-IBPath $Path
    if ($Directory) { [IO.Directory]::CreateDirectory($p) | Out-Null }
    elseif (-not [IO.File]::Exists($p)) { [IO.File]::WriteAllBytes($p, @()) }
    $acl = Get-Acl -LiteralPath $p
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($rule) | Out-Null }
    $ids = @([Security.Principal.WindowsIdentity]::GetCurrent().User, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))
    $inherit = if ($Directory) { 'ContainerInherit,ObjectInherit' } else { 'None' }
    foreach ($id in $ids) { $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($id, 'FullControl', $inherit, 'None', 'Allow')) }
    Set-Acl -LiteralPath $p -AclObject $acl
    $check = Get-Acl -LiteralPath $p
    if (-not $check.AreAccessRulesProtected -or @($check.Access).Count -ne 2) { throw 'Nao foi possivel confirmar permissoes privadas.' }
    foreach ($r in $check.Access) {
        if ($ids.Value -notcontains $r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -or $r.IsInherited -or $r.AccessControlType -ne 'Allow' -or $r.FileSystemRights -ne 'FullControl') { throw 'Permissoes privadas divergentes.' }
    }
    return $p
}

function Get-IBFiles([string]$Root, [string]$Relative = '') {
    foreach ($entry in Get-ChildItem -LiteralPath (Join-Path $Root $Relative) -Force) {
        $rel = if ($Relative) { $Relative + '/' + $entry.Name } else { $entry.Name }
        if ($entry.PSIsContainer -and ($entry.Name -in @('node_modules','backups','daemon','.agents','.maestri','agent-skills','artifacts','coverage','dist','raw','--prefix','chrome-preview-profile') -or $entry.Name -match '(^\.git($|[-_.])|\.git$)' -or $rel -match '^docs/(auditoria|re)($|/)')) { continue }
        if (-not $entry.PSIsContainer -and (($entry.Name -ne '.env.example' -and $entry.Name -like '.env*') -or $entry.Name -match '\.(env|log|zip|tgz|tap|bak|tmp|orig|pem|key)$' -or $entry.Name -match '^test_queues.*\.js$' -or $rel -match '^MAESTRI-[^/]+\.md$' -or $rel -in @('AGENTS.md','config/analysts_map.json','test_nossatelecom_real.js','test_login_wrong.js','test_rules.js','temp.json','html_dump.html','check_url.txt','query','REINICIAR_PRODUCAO.bat','instalador/REINICIAR_PRODUCAO.bat','instalador/GUIA_OPERACAO.md','scripts/alinha-perfis-skills-maestri.mjs','scripts/configure-global-agent-defaults.ps1','scripts/instalar-skills-davi.mjs','scripts/instalar-skills-india.mjs','scripts/repair-codex-launchers.ps1'))) { continue }
        $null = Assert-IBPath $entry.FullName
        if ($entry.PSIsContainer) { Get-IBFiles $Root $rel } else { $rel }
    }
}

function Test-IBPackage([string]$Root) {
    $null = Assert-IBPath $Root
    foreach ($name in @('server.js','package.json','package-lock.json')) {
        if (-not [IO.File]::Exists((Get-IBTarget $Root $name))) { throw "Pacote incompleto: falta $name." }
    }
    $pkg = Get-Content -LiteralPath (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json
    if ($pkg.name -ne 'infoboard' -or $pkg.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Identidade ou versao do pacote invalida.' }
    return $pkg
}

function Remove-IBDependencyTree([string]$Root) {
    # Esta rotina so recebe o caminho exato node_modules de uma instalacao validada.
    $target = Assert-IBPath $Root
    if ((Split-Path -Leaf $target) -ne 'node_modules') { throw 'Caminho de dependencias inesperado.' }
    $pending = [Collections.Generic.Stack[string]]::new()
    $pending.Push($target)
    while ($pending.Count) {
        foreach ($item in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
            $null = Assert-IBPath $item.FullName
            if ($item.PSIsContainer) { $pending.Push($item.FullName) }
        }
    }
    Remove-Item -LiteralPath $target -Recurse -Force
}

function Write-IBLog($Context, [string]$Message) {
    $line = ('{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $Message)
    Write-Host $line
    if ($Context.Log) {
        try { [IO.File]::AppendAllText($Context.Log, $line + [Environment]::NewLine, [Text.Encoding]::UTF8) }
        catch {
            $Context.LogFailed = $true
            # Disco cheio/perda do log nunca pode impedir o rollback.
            Write-Host '[AVISO LOG] Nao foi possivel gravar o registro. Preserve esta tela e confira espaco/permissoes.'
        }
    }
}

function Invoke-IBStage($Context, [int]$Number, [string]$Name, [scriptblock]$Work) {
    $Context.Stage = $Number
    Write-IBLog $Context "[ETAPA $Number/8] $Name - INICIO"
    & $Work
    Write-IBLog $Context "[ETAPA $Number/8] $Name - CONCLUIDA"
    if ($Context.LogFailed) { throw 'Nao foi possivel manter o log; confira espaco livre e permissoes.' }
}

function Get-IBPort([string]$Root) {
    $port = 3000
    $envFile = Get-IBTarget $Root '.env'
    if (Test-Path -LiteralPath $envFile) {
        foreach ($line in [IO.File]::ReadAllLines($envFile)) {
            if ($line -match '^\s*PORT\s*=\s*["'']?(\d+)["'']?\s*(?:#.*)?$') { $port = [int]$Matches[1] }
        }
    }
    if ($port -lt 1 -or $port -gt 65535) { throw 'PORT invalida no .env; corrija apenas essa configuracao.' }
    return $port
}

function Get-IBService([string]$Root) {
    $found = @()
    foreach ($svc in Get-CimInstance Win32_Service -Filter "Name like '%infoboard%' OR DisplayName = 'Infoboard TV'") {
        if ($svc.PathName -notmatch '^(?:"([^"]+)"|(\S+))') { continue }
        $exe = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
        if ([IO.Path]::IsPathRooted($exe) -and [IO.Path]::GetFullPath($exe).StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase)) {
            $null = Assert-IBPath $exe
            $found += $svc
        }
    }
    if ($found.Count -ne 1) { throw 'Esperado exatamente um servico Infoboard vinculado a esta pasta. Confira services.msc e o caminho do executavel; nenhum processo sera encerrado por porta.' }
    return $found[0]
}

function Get-IBRuntimePlan($Service, $Runtime, [string]$Root, [string]$Work, [int]$Port) {
    if ($Service.PathName -notmatch '^(?:"([^"]+)"|(\S+))') { throw 'Pacote de servico sem caminho valido.' }
    $exe = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
    $xmlPath = Get-IBTarget $Root ([IO.Path]::GetFullPath([IO.Path]::ChangeExtension($exe, '.xml')).Substring($Root.Length + 1))
    if (-not [IO.File]::Exists($xmlPath)) { throw 'Pacote de servico sem XML do node-windows; revise a instalacao do servico antes de atualizar.' }
    $settings = [Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver = $null
    $reader = [Xml.XmlReader]::Create($xmlPath, $settings)
    $xml = [Xml.XmlDocument]::new()
    $xml.XmlResolver = $null
    try { $xml.Load($reader) } finally { $reader.Dispose() }
    $exec = $xml.SelectSingleNode('/service/executable')
    if (-not $exec) { throw 'Pacote de servico sem executable no XML.' }
    $saved = Protect-IBPath (Join-Path $Work 'servico-anterior.xml')
    [IO.File]::Copy($xmlPath, $saved, $true)
    $exec.InnerText = $Runtime.NodePath
    $portNode = $xml.SelectSingleNode('/service/env[@name="PORT"]')
    $oldPort = $Port
    if ($portNode) {
        if (-not [int]::TryParse($portNode.GetAttribute('value'), [ref]$oldPort) -or $oldPort -lt 1 -or $oldPort -gt 65535) { throw 'PORT invalida no XML do servico anterior.' }
    }
    if (-not $portNode) { $portNode = $xml.CreateElement('env'); $portNode.SetAttribute('name','PORT'); $null = $xml.DocumentElement.AppendChild($portNode) }
    $portNode.SetAttribute('value', [string]$Port)
    return @{ Path=$xmlPath; Saved=$saved; Xml=$xml; PreviousPort=$oldPort }
}

function Get-IBActions {
    return @{
        Source = {
            param($stage, $local)
            $destination = Join-Path $stage 'source'
            if ($local) {
                $local = Assert-IBPath $local
                $null = Test-IBPackage $local
                [IO.Directory]::CreateDirectory($destination) | Out-Null
                foreach ($rel in @(Get-IBFiles $local)) {
                    $to = Get-IBTarget $destination $rel
                    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($to)) | Out-Null
                    [IO.File]::Copy((Get-IBTarget $local $rel), $to, $false)
                }
            } else {
                Write-Host '[PACOTE] Consultando a revisao publicada no GitHub...'
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                $head = Invoke-RestMethod -Uri 'https://api.github.com/repos/JSDavi/Infoboard/commits/master' -Headers @{ 'User-Agent'='InfoBoard-Updater' } -TimeoutSec 30
                if ($head.sha -notmatch '^[a-f0-9]{40}$') { throw 'Revisao GitHub invalida.' }
                Write-Host ('[PACOTE] Baixando revisao fixa: ' + $head.sha)
                $archive = Join-Path $stage 'source.zip'
                Invoke-WebRequest -Uri ('https://github.com/JSDavi/Infoboard/archive/' + $head.sha + '.zip') -OutFile $archive -UseBasicParsing -TimeoutSec 120
                Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $stage 'download')
                $expanded = Assert-IBPath (Join-Path $stage ('download/Infoboard-' + $head.sha))
                $null = Test-IBPackage $expanded
                [IO.Directory]::Move($expanded, $destination)
            }
            return $destination
        }
        Runtime = { param($stage) Invoke-IBEnsureNode -LogDirectory $stage }
        Dependencies = {
            param($source, $runtime, $log)
            # npm.cmd fica junto do Node validado; nao depender de um npm antigo no PATH.
            Write-Host ('[NPM] Preparando dependencias; aguarde. Registro privado: ' + $log)
            $cli = Join-Path (Split-Path -Parent $runtime.NpmPath) 'node_modules/npm/bin/npm-cli.js'
            $null = Assert-IBPath $cli
            if (-not [IO.File]::Exists($cli)) { throw 'npm CLI nao encontrado junto do Node validado; repare a instalacao oficial do Node.' }
            $info = [Diagnostics.ProcessStartInfo]::new()
            $info.FileName = $runtime.NodePath
            $info.Arguments = '"{0}" ci --omit=dev --prefix "{1}"' -f $cli, $source
            $info.UseShellExecute = $false
            $info.CreateNoWindow = $true
            $info.RedirectStandardOutput = $true
            $info.RedirectStandardError = $true
            $process = [Diagnostics.Process]::new()
            $process.StartInfo = $info
            try {
                $null = $process.Start()
                $stdout = $process.StandardOutput.ReadToEndAsync()
                $stderr = $process.StandardError.ReadToEndAsync()
                $process.WaitForExit()
                [IO.File]::WriteAllText($log, $stdout.Result + [Environment]::NewLine + $stderr.Result)
                $exitCode = $process.ExitCode
            } finally { $process.Dispose() }
            Write-Host ('[NPM] Processo encerrado. Codigo: ' + $exitCode)
            if ($exitCode -ne 0) { throw ('npm ci falhou, codigo ' + $exitCode + '. Consulte npm.log privado; confira internet/proxy/antivirus/lockfile antes de tentar novamente.') }
        }
        Service = { param($root) Get-IBService $root }
        RuntimePlan = { param($service,$runtime,$root,$work,$port) Get-IBRuntimePlan $service $runtime $root $work $port }
        Stop = {
            param($service)
            $current = Get-Service -Name $service.Name
            if ($current.Status -ne 'Stopped') {
                Stop-Service -Name $service.Name -ErrorAction Stop
                $current.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(45))
            }
        }
        Start = {
            param($service)
            Start-Service -Name $service.Name -ErrorAction Stop
            (Get-Service -Name $service.Name).WaitForStatus('Running', [TimeSpan]::FromSeconds(45))
        }
        Health = {
            param($port, $service)
            $lastFailure = 'servico ainda nao respondeu.'
            for ($attempt = 0; $attempt -lt 45; $attempt++) {
                try {
                    # O HTTP precisa pertencer ao processo do servico escolhido.
                    # Um site diferente na mesma porta nunca confirma esta atualizacao.
                    $svc = Get-CimInstance Win32_Service | Where-Object Name -EQ $service.Name
                    $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
                    if (-not $svc -or $svc.State -ne 'Running' -or $listeners.Count -eq 0) { throw 'HTTP ainda indisponivel.' }
                    $processes = @(Get-CimInstance Win32_Process)
                    foreach ($listener in $listeners) {
                        $ownerId = [uint32]$listener.OwningProcess
                        $owned = $false
                        for ($depth = 0; $depth -lt 20 -and $ownerId; $depth++) {
                            if ($ownerId -eq [uint32]$svc.ProcessId) { $owned = $true; break }
                            $parent = $processes | Where-Object ProcessId -EQ $ownerId | Select-Object -First 1
                            if (-not $parent -or $parent.ParentProcessId -eq $ownerId) { break }
                            $ownerId = [uint32]$parent.ParentProcessId
                        }
                        if (-not $owned) { throw 'HTTP pertence a outro processo; porta ocupada.' }
                    }
                    $res = Invoke-WebRequest -Uri ("http://127.0.0.1:$port/") -UseBasicParsing -TimeoutSec 3
                    if ($res.StatusCode -eq 200) { return }
                    $lastFailure = 'HTTP respondeu codigo ' + $res.StatusCode + '.'
                } catch { $lastFailure = $_.Exception.Message }
                Start-Sleep -Seconds 2
            }
            throw ('HTTP nao respondeu 200 em 90 segundos. Ultima verificacao: ' + $lastFailure + ' Confira logs do servico, PORT e ocupacao da porta; nao ha confirmacao de painel funcionando.')
        }
        Confirm = { param($message) (Read-Host ($message + ' [S/N] [N]')) -eq 'S' }
    }
}

function Restore-IBUpdate($c, $actions) {
    Write-IBLog $c '[ROLLBACK] INICIO: restaurando arquivos e dependencias anteriores, sem download.'
    & $actions.Stop $c.Service
    if ($c.EnvChanged) {
        [IO.File]::WriteAllBytes((Get-IBTarget $c.App '.env'), [IO.File]::ReadAllBytes((Get-IBTarget $c.Work 'configuracao.env')))
    }
    foreach ($rel in $c.NewFiles) {
        $p = Get-IBTarget $c.App $rel
        if ([IO.File]::Exists($p)) { [IO.File]::Delete($p) }
    }
    $zip = [IO.Compression.ZipFile]::OpenRead($c.Backup)
    try {
        foreach ($entry in $zip.Entries) {
            $to = Get-IBTarget $c.App $entry.FullName
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($to)) | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $to, $true)
        }
    } finally { $zip.Dispose() }
    $deps = Get-IBTarget $c.App 'node_modules'
    if ($c.NewDeps -and (Test-Path -LiteralPath $deps)) { Remove-IBDependencyTree $deps }
    if ($c.OldDepsMoved) { [IO.Directory]::Move((Get-IBTarget $c.Work 'previous-node_modules'), $deps) }
    if ($c.ServicePlan) {
        $null = Assert-IBPath $c.ServicePlan.Path
        [IO.File]::Copy($c.ServicePlan.Saved, $c.ServicePlan.Path, $true)
    }
    if ($c.WasRunning) {
        & $actions.Start $c.Service
        $oldPort = if ($c.ServicePlan) { $c.ServicePlan.PreviousPort } else { $c.Port }
        & $actions.Health $oldPort $c.Service
    }
    Write-IBLog $c '[ROLLBACK] CONCLUIDO: estado anterior restaurado; a atualizacao FALHOU.'
}

function Invoke-IBUpdate {
    param([string]$ApplicationDirectory, [string]$SourceDirectory, [hashtable]$Actions)
    $c = @{ App=$null; Work=$null; Log=$null; Lock=$null; LogFailed=$false; Stage=1; Changed=$false; NewDeps=$false; OldDepsMoved=$false; NewFiles=@(); WasRunning=$false; ServicePlan=$null; EnvChanged=$false }
    try {
        $c.App = Assert-IBPath $ApplicationDirectory
        if ($c.App -eq [IO.Path]::GetPathRoot($c.App).TrimEnd('\') -or $c.App -eq $env:USERPROFILE -or $c.App -eq $env:WINDIR) { throw 'Pasta de sistema/raiz recusada.' }
        $installed = Test-IBPackage $c.App
        if ($SourceDirectory) {
            $SourceDirectory = Assert-IBPath $SourceDirectory
            if ($SourceDirectory -eq $c.App -or $SourceDirectory.StartsWith($c.App + '\', [StringComparison]::OrdinalIgnoreCase) -or $c.App.StartsWith($SourceDirectory + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Origem e instalacao sobrepostas.' }
        }
        $private = Protect-IBPath (Get-IBTarget $c.App 'backups') -Directory
        try { $c.Lock = [IO.File]::Open((Get-IBTarget $private 'atualizacao.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
        catch { throw 'Outra atualizacao pode estar em andamento, ou o bloqueio nao pode ser criado. Confira antes de tentar novamente.' }
        $c.Work = Protect-IBPath (Join-Path $private ('update_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '_' + [guid]::NewGuid().ToString('N'))) -Directory
        $c.Log = Protect-IBPath (Join-Path $c.Work 'atualizacao.log')
        Write-IBLog $c '[ETAPA 1/8] Pasta e permissoes privadas validadas - CONCLUIDA'
        $c.Port = Get-IBPort $c.App
        Invoke-IBStage $c 2 'Preparar pacote e conferir versao' {
            $c.Source = Assert-IBPath (& $Actions.Source $c.Work $SourceDirectory)
            $new = Test-IBPackage $c.Source
            $c.Version = $new.version
            Write-IBLog $c ('Versao instalada: ' + $installed.version + '; pacote: ' + $c.Version)
            if ([version]$c.Version -lt [version]$installed.version) {
                if (-not (& $Actions.Confirm 'Pacote mais antigo. Autoriza downgrade?')) { throw 'Downgrade cancelado pelo operador.' }
            }
        }
        Invoke-IBStage $c 3 'Conferir Node e preparar dependencias sem parar o painel' {
            $c.Runtime = & $Actions.Runtime $c.Work
            if ($c.Runtime.RebootRequired) { throw 'NODE_REBOOT_REQUIRED: reinicie o Windows antes de tentar novamente; o painel ainda nao foi parado.' }
            $npmLog = Protect-IBPath (Join-Path $c.Work 'npm.log')
            & $Actions.Dependencies $c.Source $c.Runtime $npmLog
            if (-not [IO.Directory]::Exists((Get-IBTarget $c.Source 'node_modules'))) { throw 'npm nao gerou node_modules no pacote preparado.' }
        }
        Invoke-IBStage $c 4 'Backup privado e identificar servico desta instalacao' {
            $c.Service = & $Actions.Service $c.App
            $c.WasRunning = $c.Service.State -eq 'Running'
            $c.ServicePlan = & $Actions.RuntimePlan $c.Service $c.Runtime $c.App $c.Work $c.Port
            $envFile = Get-IBTarget $c.App '.env'
            if ([IO.File]::Exists($envFile)) {
                $null = Protect-IBPath $envFile
                $savedEnv = Protect-IBPath (Join-Path $c.Work 'configuracao.env')
                [IO.File]::WriteAllBytes($savedEnv, [IO.File]::ReadAllBytes($envFile))
            }
            $mapFile = Get-IBTarget $c.App 'config/analysts_map.json'
            if ([IO.File]::Exists($mapFile)) {
                $null = Protect-IBPath $mapFile
                $savedMap = Protect-IBPath (Join-Path $c.Work 'mapa-analistas.json')
                [IO.File]::Copy($mapFile, $savedMap, $true)
            }
            Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
            $c.Backup = Protect-IBPath (Join-Path $c.Work 'fontes-anteriores.zip')
            $stream = [IO.File]::Open($c.Backup, 'Truncate', 'ReadWrite', 'None')
            $zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
            try {
                foreach ($rel in @(Get-IBFiles $c.App)) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Get-IBTarget $c.App $rel), $rel) | Out-Null }
            } finally { $zip.Dispose(); $stream.Dispose() }
            $z = [IO.Compression.ZipFile]::OpenRead($c.Backup)
            try { if ($z.Entries.Count -eq 0) { throw 'Backup vazio.' } } finally { $z.Dispose() }
            # Estado da maquina que instalou a versao nunca vem do pacote fonte.
            # O registro local entra no ZIP anterior para restauracao no rollback.
            $c.Files = @(Get-IBFiles $c.Source | Where-Object { $_ -ne '.infoboard-installation.json' })
            foreach ($rel in $c.Files) { $null = Get-IBTarget $c.App $rel }
            $null = Get-IBTarget $c.App 'node_modules'
        }
        Invoke-IBStage $c 5 'Parar somente o servico vinculado a esta pasta' {
            # Marcar antes da parada: uma falha apos parar exige recuperacao do estado.
            $c.Changed = $true
            & $Actions.Stop $c.Service
        }
        Invoke-IBStage $c 6 'Aplicar fontes e dependencias preservando configuracao' {
            $deps = Get-IBTarget $c.App 'node_modules'
            if (Test-Path -LiteralPath $deps) {
                [IO.Directory]::Move($deps, (Get-IBTarget $c.Work 'previous-node_modules'))
                $c.OldDepsMoved = $true
            }
            foreach ($rel in $c.Files) {
                $to = Get-IBTarget $c.App $rel
                if (-not [IO.File]::Exists($to)) { $c.NewFiles += $rel }
                [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($to)) | Out-Null
                [IO.File]::Copy((Get-IBTarget $c.Source $rel), $to, $true)
            }
            [IO.Directory]::Move((Get-IBTarget $c.Source 'node_modules'), $deps)
            $c.NewDeps = $true
            $envPath = Get-IBTarget $c.App '.env'
            if ([IO.File]::Exists($envPath)) {
                $text = [IO.File]::ReadAllText($envPath)
                $updated = Convert-IBPbxConfigText $text
                if ($updated -cne $text) {
                    # Backup ja foi protegido na etapa 4; marcar antes da escrita.
                    $c.EnvChanged = $true
                    $bytes = [IO.File]::ReadAllBytes($envPath)
                    $bom = $bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191
                    [IO.File]::WriteAllText($envPath, $updated, [Text.UTF8Encoding]::new($bom))
                    Write-IBLog $c 'PBX: endereco legado migrado para sip33.tsinfo.net.br; demais configuracoes preservadas.'
                }
            }
            if ($c.ServicePlan) {
                $null = Assert-IBPath $c.ServicePlan.Path
                $c.ServicePlan.Xml.Save($c.ServicePlan.Path)
            }
        }
        Invoke-IBStage $c 7 'Iniciar servico e conferir resposta HTTP' {
            & $Actions.Start $c.Service
            & $Actions.Health $c.Port $c.Service
        }
        Invoke-IBStage $c 8 'Registrar versao instalada e finalizar relatorio' {
            # Registrar apenas apos o health check do servico. O arquivo anterior
            # esta no backup. Se nao existia, o rollback remove o novo.
            $metadata = Get-IBTarget $c.App '.infoboard-installation.json'
            $tempMetadata = Get-IBTarget $c.App ('.infoboard-installation.json-' + [guid]::NewGuid().ToString('N') + '.tmp')
            if (-not [IO.File]::Exists($metadata)) { $c.NewFiles += '.infoboard-installation.json' }
            try {
                $value = @{ version = $c.Version; installedAt = [DateTime]::UtcNow.ToString('o', [Globalization.CultureInfo]::InvariantCulture) } | ConvertTo-Json -Compress
                [IO.File]::WriteAllText($tempMetadata, $value + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
                if ([IO.File]::Exists($metadata)) { [IO.File]::Replace($tempMetadata, $metadata, [NullString]::Value) }
                else { [IO.File]::Move($tempMetadata, $metadata) }
            } finally {
                if ([IO.File]::Exists($tempMetadata)) { [IO.File]::Delete($tempMetadata) }
            }
            Write-IBLog $c ('SUCESSO: versao ' + $c.Version + '; http://localhost:' + $c.Port + '; .env e mapa local preservados.')
            Write-IBLog $c ('Backup e diagnostico privados: ' + $c.Work)
        }
        return 0
    } catch {
        # A mensagem pode conter dados de um subprocesso; registrar apenas diagnosticos
        # nossos e tipo/linha da excecao, sem despejar objetos, env ou transcricoes.
        $failure = $_
        $known = $failure.Exception.Message
        if ($known -notmatch '^(Informe |Link |Caminho |Pacote |Identidade |Pasta |Origem |Outra |Permiss|Nao foi |Esperado |PORT |npm |Node |NODE_|HTTP |Backup |Downgrade )') { $known = 'Falha operacional; confira o detalhe tecnico e a etapa abaixo.' }
        Write-IBLog $c ("FALHA ERR_U{0:00}: {1}" -f $c.Stage, $known)
        Write-IBLog $c ('Tipo: ' + $failure.Exception.GetType().Name + '; linha do payload: ' + $failure.InvocationInfo.ScriptLineNumber)
        Write-IBLog $c 'Acao: confira caminho, permissoes, internet/proxy, espaco livre e services.msc. Nao compartilhe .env ou backups. Corrija a causa antes de tentar novamente.'
        if ($c.Changed) {
            try { Restore-IBUpdate $c $Actions }
            catch {
                Write-IBLog $c ('ROLLBACK FALHOU: ' + $_.Exception.GetType().Name + '. Nao ha confirmacao de recuperacao. Preserve a pasta de backup e acione o responsavel tecnico.')
                return 2
            }
        } else { Write-IBLog $c 'Arquivos da aplicacao nao substituidos; parada do painel nao solicitada.' }
        if ($c.Work) { Write-IBLog $c ('Diagnostico privado: ' + $c.Work) }
        if ($failure.Exception.Message -like '*NODE_REBOOT_REQUIRED*') { return 3010 }
        return 1
    } finally {
        if ($c.Lock) { $c.Lock.Dispose() }
    }
}

function Start-IBUpdater([string]$Self) {
    try {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $admin = ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        if (-not $admin) {
            Write-Host 'INFOBOARD - ATUALIZACAO: o Windows solicitara permissao de administrador (UAC).'
            try {
                $child = Start-Process -FilePath $env:ComSpec -ArgumentList ('/d /s /c ""' + $Self + '""') -Verb RunAs -Wait -PassThru
                return $child.ExitCode
            } catch {
                Write-Host 'FALHA ERR_UAC: elevacao cancelada ou recusada. Nenhuma atualizacao iniciada. Use Executar como administrador se autorizado.'
                Read-Host 'Pressione ENTER para fechar' | Out-Null
                return 1
            }
        }
        Write-Host 'INFOBOARD - ATUALIZADOR AUTONOMO / 8 ETAPAS'
        $here = Split-Path -Parent $Self
        $app = $null
        foreach ($candidate in @($here, (Split-Path -Parent $here))) {
            if (Test-Path -LiteralPath (Join-Path $candidate 'server.js')) { $app = $candidate; break }
        }
        if ($app) {
            Write-Host ('Instalacao encontrada: ' + $app)
            $answer = Read-Host 'ENTER confirma; ou digite outro caminho absoluto'
            if ($answer) { $app = $answer.Trim('"') }
        } else { $app = (Read-Host 'Caminho absoluto da instalacao Infoboard').Trim('"') }
        # Arquivo enviado sozinho sempre baixa a revisao publica. Pacote local apenas
        # quando o BAT esta em instalador/ de uma distribuicao diferente da instalada.
        $source = $null
        $parent = Split-Path -Parent $here
        if ((Split-Path -Leaf $here) -eq 'instalador' -and $parent -ne $app -and (Test-Path -LiteralPath (Join-Path $parent 'package-lock.json'))) { $source = $parent }
        $result = Invoke-IBUpdate -ApplicationDirectory $app -SourceDirectory $source -Actions (Get-IBActions)
        Read-Host 'Processo encerrado. Confira o resultado acima. Pressione ENTER para fechar' | Out-Null
        return $result
    } catch {
        Write-Host ('FALHA ERR_INICIO: ' + $_.Exception.GetType().Name + '. Confira a pasta e as permissoes do Windows. Nenhum sucesso confirmado.')
        Read-Host 'Pressione ENTER para fechar' | Out-Null
        return 1
    }
}

# INFOBOARD_PAYLOAD_END
