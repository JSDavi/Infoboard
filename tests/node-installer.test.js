const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const helper = path.resolve(__dirname, '../instalador/ensure-node.ps1');
const source = fs.readFileSync(helper, 'utf8');
const windows = { skip: process.platform !== 'win32' };
const portable = 'C:\\fixture\\portable';
const installed = 'C:\\Program Files\\nodejs';

function ps(command) {
  const env = { ...process.env, IB_NODE_HELPER: helper };
  for (const key of Object.keys(env)) if (/^PSModulePath$/i.test(key)) delete env[key];
  const output = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    `$ErrorActionPreference='Stop'; . ([scriptblock]::Create([IO.File]::ReadAllText($env:IB_NODE_HELPER))); ${command}`],
  { env, encoding: 'utf8', stdio: 'pipe', timeout: 20000 });
  // Write-Host uses the host/information stream; only the last line is JSON.
  const lines = output.trim().split(/\r?\n/);
  return { data: JSON.parse(lines.at(-1)), output };
}

// Complete in-memory boundary: no downloads, disk writes, real MSI or PATH changes.
// Trap dangerous cmdlets as well so an accidental default cannot launch a process.
const harness = String.raw`
  function Start-Process { throw 'REAL_PROCESS_FORBIDDEN' }
  function Invoke-WebRequest { throw 'REAL_NETWORK_FORBIDDEN' }
  function Set-Acl { throw 'REAL_ACL_FORBIDDEN' }
  function New-Item { throw 'REAL_WRITE_FORBIDDEN' }
  $script:s = @{
    Events = [Collections.Generic.List[string]]::new(); Before = @(); After = @('C:\Program Files\nodejs\node.exe')
    InitialVersion = 'v22.0.0'; InstalledVersion = 'v24.22.1'; NpmVersion = '11.0.0'
    HasNpm = $true; ExitCode = 0; Installed = $false; Arch = 'x64'; Deny = ''
    Hash = ('a' * 64); Sums = ''; SignatureStatus = 'Valid'; Subject = 'CN=OpenJS Foundation, O=OpenJS Foundation, C=US'
    Reparse = ''; MissingCertificate = $false; DenyVersion = $false
  }
  $script:s.Sums = ('a' * 64) + '  node-v24.22.1-x64.msi' + "\n" + ('a' * 64) + '  node-v24.22.1-arm64.msi'
  # PowerShell single quoted strings and the raw JS template keep backslash-n literal;
  # use a real newline before parsing SHASUMS256.
  $script:s.Sums = $script:s.Sums.Replace('\n', [Environment]::NewLine)
  $script:a = @{
    Candidates = {
      $script:s.Events.Add('Candidates')
      if ($script:s.Installed) { return $script:s.After }
      return $script:s.Before
    }
    FileExists = {
      param($p)
      $script:s.Events.Add('Exists:' + $p)
      if ([IO.Path]::GetFileName($p) -eq 'npm.cmd') { return $script:s.HasNpm }
      return $true
    }
    Version = {
      param($p)
      $script:s.Events.Add('Version:' + $p)
      if ($script:s.DenyVersion) { throw 'SECRET_VERSION_ACCESS_DENIED' }
      if ($script:s.Installed) { return $script:s.InstalledVersion }
      return $script:s.InitialVersion
    }
    NpmVersion = {
      param($p)
      $script:s.Events.Add('NpmVersion:' + $p)
      return $script:s.NpmVersion
    }
    InstallDirectory = { 'C:\Program Files\nodejs' }
    Architecture = { $script:s.Events.Add('Architecture'); return $script:s.Arch }
    AssertNoReparse = {
      param($p)
      $script:s.Events.Add('Assert:' + $p)
      if ($script:s.Reparse -and $p.StartsWith($script:s.Reparse)) { throw 'SECRET_REPARSE' }
    }
    ProtectDirectory = {
      param($p)
      $script:s.Events.Add('Protect:' + $p)
      if ($script:s.Deny -eq 'ACL') { throw 'SECRET_ACCESS_DENIED' }
    }
    Fetch = {
      param($url, $p)
      $script:s.Events.Add('Fetch:' + $url)
      if ($script:s.Deny -eq 'Fetch') { throw 'SECRET_PROXY_PASSWORD' }
    }
    ReadText = { param($p) $script:s.Sums }
    Hash = { param($p) $script:s.Events.Add('Hash'); return $script:s.Hash }
    Signature = {
      param($p)
      $script:s.Events.Add('Signature')
      $cert = if ($script:s.MissingCertificate) { $null } else { [pscustomobject]@{ Subject = $script:s.Subject } }
      return [pscustomobject]@{ Status = $script:s.SignatureStatus; SignerCertificate = $cert }
    }
    Install = {
      param($msi, $log)
      $script:s.Events.Add('Install:' + $msi)
      $script:s.Events.Add('Log:' + $log)
      if ($script:s.Deny -eq 'Install') { throw 'SECRET_MSI_ACCESS_DENIED' }
      $script:s.Installed = $true
      return $script:s.ExitCode
    }
    RefreshPath = { param($p) $script:s.Events.Add('Refresh:' + $p) }
  }
`;

function scenario(setup = '', logDirectory = 'C:\\fixture\\logs') {
  const quoted = logDirectory.replaceAll("'", "''");
  return ps(`${harness}\n${setup}\n
    Set-StrictMode -Version 2
    $result = $null; $message = $null; $beforePath = $env:Path
    try { $result = @(Invoke-IBEnsureNode -LogDirectory '${quoted}' -Adapters $script:a) }
    catch { $message = $_.Exception.Message }
    [pscustomobject]@{ Result=$result; Error=$message; Events=@($script:s.Events.ToArray()); PathUnchanged=($env:Path -ceq $beforePath) } |
      ConvertTo-Json -Depth 6 -Compress
  `);
}

function resultOf(run, reboot = false, directory = installed) {
  assert.equal(run.data.Error, null, run.output);
  assert.equal(run.data.Result.length, 1, 'Host messages must not pollute the result');
  assert.deepEqual(run.data.Result[0], {
    NodePath: `${directory}\\node.exe`, NpmPath: `${directory}\\npm.cmd`, RebootRequired: reboot
  });
  assert.equal(run.data.PathUnchanged, true);
}

function blocked(run, stage) {
  assert.match(run.data.Error, new RegExp(stage), run.output);
  assert.equal(run.data.Result, null);
  assert.ok(!run.data.Events.some(e => e.startsWith('Install:')), run.output);
  assert.ok(!run.data.Events.some(e => e.startsWith('Refresh:')), run.output);
  assert.doesNotMatch(run.output, /SECRET_|REAL_.*FORBIDDEN/);
  assert.equal(run.data.PathUnchanged, true);
}

test('helper is standalone, with no policy bypass, core dependency or machine PATH write', () => {
  assert.doesNotMatch(source, /ExecutionPolicy|updater-core\s*\.ps1|SetEnvironmentVariable|Start-Transcript/i);
  assert.match(source, /AllowAutoRedirect = \$false/);
  assert.match(source, /https:\/\/nodejs\.org\/dist\//);
  assert.match(source, /v24\.22\.1/);
  assert.match(source, /\/Le /);
});

test('PS 5.1 parses function-only source, loading has no effects and no top-level parameters', windows, () => {
  const run = ps(`
    $tokens=$null; $errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseInput([IO.File]::ReadAllText($env:IB_NODE_HELPER),[ref]$tokens,[ref]$errors)
    $before=$env:Path; $preference=$ErrorActionPreference
    $output=@(. ([scriptblock]::Create([IO.File]::ReadAllText($env:IB_NODE_HELPER))))
    [pscustomobject]@{ Major=$PSVersionTable.PSVersion.Major; Minor=$PSVersionTable.PSVersion.Minor
      Errors=@($errors).Count; Param=($null -ne $ast.ParamBlock); Output=$output.Count
      FunctionsOnly=(@($ast.EndBlock.Statements | Where-Object { $_ -isnot [Management.Automation.Language.FunctionDefinitionAst] }).Count -eq 0)
      PathUnchanged=($env:Path -ceq $before); PreferenceUnchanged=($ErrorActionPreference -eq $preference) } | ConvertTo-Json -Compress
  `);
  assert.deepEqual(run.data, { Major: 5, Minor: 1, Errors: 0, Param: false, Output: 0,
    FunctionsOnly: true, PathUnchanged: true, PreferenceUnchanged: true });
});

for (const version of ['v22.0.0', 'v24.22.1', 'v26.12.1', 'v100.1.0']) {
  test(`preserves working ${version} and adjacent functional npm.cmd`, windows, () => {
    const run = scenario(`$script:s.Before=@('C:\\fixture\\portable\\node.exe'); $script:s.InitialVersion='${version}'`);
    resultOf(run, false, portable);
    assert.ok(run.data.Events.includes(`NpmVersion:${portable}\\npm.cmd`));
    assert.ok(!run.data.Events.includes('Architecture'));
    assert.ok(!run.data.Events.some(e => /^(Protect|Fetch|Install|Refresh):/.test(e)));
  });
}

const repairCases = {
  absent: '',
  old: "$script:s.Before=@('C:\\fixture\\portable\\node.exe'); $script:s.InitialVersion='v20.19.0'",
  malformed: "$script:s.Before=@('C:\\fixture\\portable\\node.exe'); $script:s.InitialVersion='unexpected'",
  prerelease: "$script:s.Before=@('C:\\fixture\\portable\\node.exe'); $script:s.InitialVersion='v22.0.0-rc.1'",
  'npm missing': "$script:s.Before=@('C:\\fixture\\portable\\node.exe'); $script:s.HasNpm=$false; $script:a.Install={param($m,$l) $script:s.Events.Add('Install:'+ $m); $script:s.HasNpm=$true; $script:s.Installed=$true; 0}",
  'npm broken': "$script:s.Before=@('C:\\fixture\\portable\\node.exe'); $script:s.NpmVersion=''; $script:a.Install={param($m,$l) $script:s.Events.Add('Install:'+ $m); $script:s.NpmVersion='11.0.0'; $script:s.Installed=$true; 0}"
};
for (const [name, setup] of Object.entries(repairCases)) {
  test(`repairs runtime when ${name} using authenticated official MSI`, windows, () => {
    const run = scenario(setup);
    resultOf(run);
    const events = run.data.Events;
    const fetched = events.filter(e => e.startsWith('Fetch:'));
    assert.deepEqual(fetched, [
      'Fetch:https://nodejs.org/dist/v24.22.1/SHASUMS256.txt',
      'Fetch:https://nodejs.org/dist/v24.22.1/node-v24.22.1-x64.msi'
    ]);
    assert.ok(events.indexOf('Protect:C:\\fixture\\logs') < events.indexOf(fetched[0]));
    assert.ok(events.indexOf('Hash') < events.indexOf('Signature'));
    assert.ok(events.indexOf('Signature') < events.findIndex(e => e.startsWith('Install:')));
    assert.ok(events.findLastIndex(e => e.startsWith('Protect:')) < events.findIndex(e => e.startsWith('Install:')));
    assert.ok(events.findIndex(e => e.startsWith('Refresh:')) > events.findIndex(e => e.startsWith('Install:')));
    assert.match(run.output, /Etapa: resultado MSI; MSI: 0; log: C:\\fixture\\logs\\node-[a-f0-9]{32}\\node-msi.log/);
  });
}

test('uses native arm64 MSI', windows, () => {
  const run = scenario("$script:s.Arch='arm64'");
  resultOf(run);
  assert.ok(run.data.Events.includes('Fetch:https://nodejs.org/dist/v24.22.1/node-v24.22.1-arm64.msi'));
});

test('ignores relative node and npm from another directory; preserves next suitable Node', windows, () => {
  const run = scenario("$script:s.Before=@('node.exe','C:node.exe','C:\\fixture\\npm.cmd','C:\\fixture\\portable\\node.exe')");
  resultOf(run, false, portable);
  assert.equal(run.data.Events.filter(e => e.startsWith('Version:')).length, 1);
  assert.deepEqual(run.data.Events.filter(e => e.startsWith('NpmVersion:')), [`NpmVersion:${portable}\\npm.cmd`]);
});

for (const code of [3010, 1641]) {
  for (const ready of [true, false]) {
    test(`MSI ${code} returns reboot contract with runtime ${ready ? 'ready' : 'pending'}`, windows, () => {
      const run = scenario(`$script:s.ExitCode=${code}; ${ready ? '' : '$script:s.After=@()'}`);
      resultOf(run, true);
      assert.match(run.output, new RegExp(`MSI: ${code}; log: .*node-msi.log`));
      assert.match(run.output, /reinicie o Windows antes de continuar/);
      assert.ok(run.data.Events.includes('Refresh:'));
      assert.equal(run.data.Events.filter(e => e === 'Candidates').length, 1,
        'Do not execute a pending runtime before reboot');
    });
  }
}

test('reboot code survives a runtime that would throw until boot', windows, () => {
  const run = scenario('$script:s.ExitCode=3010; $script:s.DenyVersion=$true');
  resultOf(run, true);
  assert.ok(!run.data.Events.some(e => e.startsWith('Version:')));
});

for (const code of [1603, 1618, 5, -1]) {
  test(`MSI ${code} fails with real code, stage and private log path`, windows, () => {
    const run = scenario(`$script:s.ExitCode=${code}`);
    assert.match(run.data.Error, new RegExp(`falha em MSI; MSI: ${code}; log: C:`));
    assert.match(run.data.Error, /node-[a-f0-9]{32}\\node-msi.log/);
    assert.equal(run.data.Events.filter(e => e.startsWith('Install:')).length, 1);
    assert.ok(!run.data.Events.some(e => e.startsWith('Refresh:')));
  });
}

test('MSI 0 without working runtime fails after refreshing process PATH', windows, () => {
  const run = scenario('$script:s.After=@()');
  assert.match(run.data.Error, /validacao apos MSI; MSI: 0/);
  assert.ok(run.data.Events.includes('Refresh:'));
});

const rejectionCases = [
  ['unsupported architecture', "$script:s.Arch='x86'", 'arquitetura'],
  ['ACL denied', "$script:s.Deny='ACL'", 'protecao dos logs'],
  ['reparse ancestor', "$script:s.Reparse='C:\\fixture'", 'protecao dos logs'],
  ['download denied', "$script:s.Deny='Fetch'", 'download oficial'],
  ['hash mismatch', "$script:s.Hash=('b'*64)", 'SHA256'],
  ['hash malformed', "$script:s.Hash='garbage'", 'SHA256'],
  ['checksum absent', "$script:s.Sums=('a'*64)+'  another.msi'", 'SHA256'],
  ['checksum duplicate', '$script:s.Sums=$script:s.Sums+[Environment]::NewLine+$script:s.Sums', 'SHA256'],
  ['checksum malformed', "$script:s.Sums='not-a-hash  node-v24.22.1-x64.msi'", 'SHA256'],
  ['signature invalid', "$script:s.SignatureStatus='HashMismatch'", 'Authenticode'],
  ['signature untrusted', "$script:s.SignatureStatus='NotTrusted'", 'Authenticode'],
  ['signature unsigned', "$script:s.SignatureStatus='NotSigned'", 'Authenticode'],
  ['certificate absent', '$script:s.MissingCertificate=$true', 'Authenticode'],
  ['wrong publisher', "$script:s.Subject='CN=OpenJS Foundation, O=Other Foundation, C=US'", 'Authenticode'],
  ['publisher suffix spoof', "$script:s.Subject='O=OpenJS Foundation Evil, C=US'", 'Authenticode'],
  ['publisher prefix spoof', "$script:s.Subject='O=Evil OpenJS Foundation, C=US'", 'Authenticode'],
  ['version access denied', "$script:s.Before=@('C:\\fixture\\portable\\node.exe'); $script:s.DenyVersion=$true", 'validacao']
];
for (const [name, setup, stage] of rejectionCases) {
  test(`fails closed: ${name}`, windows, () => blocked(scenario(setup), stage));
}

test('MSI access denied is terminal and does not disclose exception payload', windows, () => {
  const run = scenario("$script:s.Deny='Install'");
  assert.match(run.data.Error, /falha em MSI; MSI: nao executado/);
  assert.doesNotMatch(run.output, /SECRET_/);
  assert.equal(run.data.Events.filter(e => e.startsWith('Install:')).length, 1);
  assert.ok(!run.data.Events.some(e => e.startsWith('Refresh:')));
});

test('missing MSI exit code fails closed without inventing success', windows, () => {
  const run = scenario('$script:s.ExitCode=$null');
  assert.match(run.data.Error, /falha em MSI; MSI: nao executado/);
  assert.ok(!run.data.Events.some(e => e.startsWith('Refresh:')));
});

test('accepts uppercase SHA256 and quoted exact OpenJS organization', windows, () => {
  const run = scenario(`$script:s.Hash=('A'*64); $script:s.Subject='CN=Node.js, O="OpenJS Foundation", C=US'`);
  resultOf(run);
});

test('rejects unknown or non-scriptblock adapters before any work', windows, () => {
  blocked(scenario("$script:a['Unexpected']={}"), 'validacao');
  blocked(scenario("$script:a['Install']='unsafe'"), 'validacao');
});

test('rechecks path protection just before MSI', windows, () => {
  const run = scenario(`$script:a.Signature={ param($p)
    $script:s.Reparse='C:\\fixture'
    [pscustomobject]@{Status='Valid';SignerCertificate=[pscustomobject]@{Subject='O=OpenJS Foundation'}}
  }`);
  blocked(run, 'protecao antes do MSI');
});

for (const target of ['relative', 'C:relative', '\\rooted', 'C:\\fixture\\bad"path', "C:\\fixture\\logs\nsecret"]) {
  test(`rejects unsafe log directory ${JSON.stringify(target)}`, windows, () => {
    const run = scenario('', target);
    blocked(run, 'validacao');
    assert.deepEqual(run.data.Events, []);
  });
}

test('native architecture detection and default MSI invocation use mocked cmdlets', windows, () => {
  const run = ps(String.raw`
    $a=IBNodeDefaultAdapters
    $env:PROCESSOR_ARCHITECTURE='AMD64'; $env:PROCESSOR_ARCHITEW6432='ARM64'; $arm=& $a.Architecture
    $env:PROCESSOR_ARCHITECTURE='x86'; $env:PROCESSOR_ARCHITEW6432='AMD64'; $x64=& $a.Architecture
    $env:PROCESSOR_ARCHITEW6432=''; $bad=$false
    try { & $a.Architecture } catch { $bad=$true }
    function Start-Process {
      [CmdletBinding()]param($FilePath,$ArgumentList,[switch]$Wait,[switch]$PassThru,$WindowStyle)
      $script:call=[pscustomobject]@{Exe=$FilePath;Args=$ArgumentList;Wait=$Wait.IsPresent;PassThru=$PassThru.IsPresent;Hidden=($WindowStyle -eq 'Hidden')}
      [pscustomobject]@{ExitCode=3010}
    }
    $code=& $a.Install "C:\private d'operador\node.msi" "C:\private d'operador\node.log"
    [pscustomobject]@{Arm=$arm;X64=$x64;RejectX86=$bad;Code=$code;Call=$script:call}|ConvertTo-Json -Depth 4 -Compress
  `);
  assert.equal(run.data.Arm, 'arm64');
  assert.equal(run.data.X64, 'x64');
  assert.equal(run.data.RejectX86, true);
  assert.equal(run.data.Code, 3010);
  assert.equal(path.win32.basename(run.data.Call.Exe).toLowerCase(), 'msiexec.exe');
  assert.deepEqual({ ...run.data.Call, Exe: undefined }, {
    Exe: undefined, Args: '/i "C:\\private d\'operador\\node.msi" /qn /norestart REBOOT=ReallySuppress /Le "C:\\private d\'operador\\node.log"',
    Wait: true, PassThru: true, Hidden: true
  });
});

test('default node and npm probes execute --version and require successful exit codes', windows, () => {
  const run = ps(String.raw`
    $a=IBNodeDefaultAdapters
    function IBFixtureNode { $script:nodeArgs=@($args); $global:LASTEXITCODE=0; 'v26.12.1' }
    function IBFixtureNpm { $script:npmArgs=@($args); $global:LASTEXITCODE=0; '11.0.0' }
    $node=& $a.Version 'IBFixtureNode'; $npm=& $a.NpmVersion 'IBFixtureNpm'
    function IBFixtureNpm { $global:LASTEXITCODE=1; '11.0.0' }
    function IBFixtureNode { $global:LASTEXITCODE=1; 'v26.12.1' }
    $badNode=& $a.Version 'IBFixtureNode'; $badNpm=& $a.NpmVersion 'IBFixtureNpm'
    [pscustomobject]@{Node=$node;Npm=$npm;BadNode=$badNode;BadNpm=$badNpm;NodeArgs=$script:nodeArgs;NpmArgs=$script:npmArgs} |
      ConvertTo-Json -Depth 3 -Compress
  `);
  assert.deepEqual(run.data, { Node: 'v26.12.1', Npm: '11.0.0', BadNode: '', BadNpm: '',
    NodeArgs: ['--version'], NpmArgs: ['--version'] });
});

test('process PATH refresh prepends validated Node and preserves private process entries', windows, () => {
  const run = ps(String.raw`
    $env:Path='C:\fixture\only-in-process;C:\fixture\only-in-process'
    $a=IBNodeDefaultAdapters
    & $a.RefreshPath 'C:\fixture\nodejs'
    [pscustomobject]@{Entries=@($env:Path -split ';')}|ConvertTo-Json -Compress
  `);
  assert.equal(run.data.Entries[0], 'C:\\fixture\\nodejs');
  assert.equal(run.data.Entries.filter(p => p === 'C:\\fixture\\only-in-process').length, 1);
});

test('download boundary rejects foreign, downgraded and credential-bearing URLs without networking', windows, () => {
  const run = ps(String.raw`
    $rejected=@()
    foreach($url in @('http://nodejs.org/file','https://evil.test/file','https://nodejs.org.evil.test/file',
      'https://user:password@nodejs.org/file','https://nodejs.org:444/file','https://nodejs.org/file?secret=x')) {
      try { IBNodeFetch $url 'C:\fixture\not-written'; $rejected += $false } catch { $rejected += $true }
    }
    ConvertTo-Json -InputObject $rejected -Compress
  `);
  assert.deepEqual(run.data, [true, true, true, true, true, true]);
});

// Real ACL algorithm, fake filesystem cmdlets and an in-memory DirectorySecurity.
const aclHarness = String.raw`
  $script:acl=[Security.AccessControl.DirectorySecurity]::new()
  $script:acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
    [Security.Principal.SecurityIdentifier]::new('S-1-1-0'),'FullControl','Allow'))
  $script:exists=$false; $script:aclGets=0; $script:corrupt=''; $script:denied=$false; $script:reparse=''
  function Test-Path { [CmdletBinding()]param($LiteralPath) return $script:exists }
  function New-Item { [CmdletBinding()]param($ItemType,$Path) $script:exists=$true }
  function Get-Item { [CmdletBinding()]param($LiteralPath,[switch]$Force)
    $attr=if($LiteralPath -eq $script:reparse){[IO.FileAttributes]::ReparsePoint}else{[IO.FileAttributes]::Directory}
    [pscustomobject]@{Attributes=$attr;PSIsContainer=$true}
  }
  function Get-Acl { [CmdletBinding()]param($LiteralPath)
    $script:aclGets++
    if ($script:aclGets -eq 2) {
      if($script:corrupt -eq 'inheritance'){$script:acl.SetAccessRuleProtection($false,$true)}
      if($script:corrupt -eq 'outsider'){$script:acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
        [Security.Principal.SecurityIdentifier]::new('S-1-1-0'),'Read','Allow'))}
      if($script:corrupt -eq 'rights'){
        $script:acl.SetAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
          [Security.Principal.WindowsIdentity]::GetCurrent().User,'Read','ContainerInherit,ObjectInherit','None','Allow'))
      }
    }
    return $script:acl
  }
  function Set-Acl { [CmdletBinding()]param($LiteralPath,$AclObject)
    if($script:denied){throw 'SECRET_ACL_DENIAL'}
    $script:acl=$AclObject
  }
`;

test('self-contained ACL algorithm removes broad permissions and verifies private inheritable ACL', windows, () => {
  const run = ps(`${aclHarness}
    IBNodeProtectDirectory 'C:\\fixture\\logs'
    [pscustomobject]@{Protected=$script:acl.AreAccessRulesProtected; Gets=$script:aclGets
      Sids=@($script:acl.Access | ForEach-Object {$_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value})
      Current=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
      Rights=@($script:acl.Access | ForEach-Object {$_.FileSystemRights.ToString()})
      Flags=@($script:acl.Access | ForEach-Object {$_.InheritanceFlags.ToString()})} | ConvertTo-Json -Compress
  `);
  assert.equal(run.data.Protected, true);
  assert.equal(run.data.Gets, 2);
  assert.deepEqual(run.data.Sids.sort(), [...new Set([run.data.Current, 'S-1-5-18'])].sort());
  assert.ok(run.data.Rights.every(r => r === 'FullControl'));
  assert.ok(run.data.Flags.every(f => f === 'ContainerInherit, ObjectInherit'));
});

for (const corruption of ['inheritance', 'outsider', 'rights', 'denial', 'reparse']) {
  test(`self-contained ACL rejects ${corruption}`, windows, () => {
    const run = ps(`${aclHarness}
      $script:corrupt='${corruption}'
      if($script:corrupt -eq 'denial'){$script:denied=$true}
      if($script:corrupt -eq 'reparse'){$script:exists=$true;$script:reparse='C:\\fixture'}
      $failed=$false
      try {IBNodeProtectDirectory 'C:\\fixture\\logs'} catch {$failed=$true}
      [pscustomobject]@{Failed=$failed;Gets=$script:aclGets}|ConvertTo-Json -Compress
    `);
    assert.equal(run.data.Failed, true);
    if (corruption === 'reparse') assert.equal(run.data.Gets, 0);
  });
}
