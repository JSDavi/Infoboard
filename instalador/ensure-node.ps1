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
