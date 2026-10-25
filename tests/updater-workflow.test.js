const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const releaseVersion = require('../package.json').version;

// Somente dependencias externas (MSI/npm/SCM/HTTP) sao substituidas. O fluxo real
// faz staging, ACL, ZIP, copia, troca de node_modules e rollback no NTFS temporario.
const harness = String.raw`
$ErrorActionPreference='Stop'
$raw=[IO.File]::ReadAllText($env:IB_CORE)
$begin=$raw.IndexOf([Environment]::NewLine+'# INFOBOARD_PAYLOAD_BEGIN')
$end=$raw.LastIndexOf([Environment]::NewLine+'# INFOBOARD_PAYLOAD_END')
if($begin -lt 0 -or $end -le $begin){throw 'Payload ausente'}
. ([scriptblock]::Create($raw.Substring($begin,$end-$begin)))
$fixture=$env:IB_FIXTURE
if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($fixture)) -ne $env:IB_FIXTURE_PARENT -or [IO.Path]::GetFileName($fixture) -notlike "infoboard-workflow-*") { throw "Fixture fora do temporario" }
$script:events = [Collections.Generic.List[string]]::new()
$script:health=0
$a=Get-IBActions
if($env:IB_CASE -eq 'remote-success'){
  function Invoke-RestMethod { param($Uri,$Headers,$TimeoutSec) $script:events.Add('remote-head'); return @{sha=('a'*40)} }
  function Invoke-WebRequest { param($Uri,$OutFile,[switch]$UseBasicParsing,$TimeoutSec)
    if($Uri -ne ('https://github.com/JSDavi/Infoboard/archive/'+('a'*40)+'.zip')){throw 'URI nao fixada'}
    $script:events.Add('remote-zip'); [IO.File]::Copy((Join-Path $env:IB_FIXTURE 'download.zip'),$OutFile)
  }
}
$a.Runtime={param($stage)
  $script:events.Add('runtime')
  if($env:IB_CASE -eq 'real-npm'){
    if(-not [IO.File]::Exists($env:IB_REAL_NODE) -or -not [IO.File]::Exists($env:IB_REAL_NPM)){throw 'Runtime explicito do teste ausente'}
    return @{NodePath=$env:IB_REAL_NODE;NpmPath=$env:IB_REAL_NPM;RebootRequired=$false}
  }
  if($env:IB_CASE -like 'native-*'){return @{NodePath=$env:IB_FIXTURE_NODE;NpmPath=(Join-Path $env:IB_FIXTURE 'npm home/npm.cmd');RebootRequired=$false}}
  return @{NodePath='fixture';NpmPath=(Join-Path $env:IB_FIXTURE 'npm fixture.cmd');RebootRequired=($env:IB_CASE -eq 'reboot')}
}
$script:nativeDeps = $a.Dependencies
$a.Dependencies={param($source,$runtime,$log)
  $script:events.Add('npm')
  if($env:IB_CASE -like 'native-*' -or $env:IB_CASE -eq 'real-npm'){ & $script:nativeDeps $source $runtime $log; return }
  if($env:IB_CASE -eq 'npm'){throw 'npm ci falhou. Fixture sem rede.'}
  [IO.Directory]::CreateDirectory((Join-Path $source 'node_modules')) | Out-Null
  [IO.File]::WriteAllText((Join-Path $source 'node_modules/dependency.txt'),'new-dependency')
}
$a.Service={param($app) $script:events.Add('service'); return @{Name='fixture';State='Running';PathName=('"'+(Join-Path $app 'daemon/fixture.exe')+'"')}}
$a.Stop={param($svc)
  $script:events.Add('stop')
  if($env:IB_CASE -eq 'log-loss'){
    $p=Get-ChildItem -LiteralPath (Join-Path $env:IB_FIXTURE "app d'operador & equipe! %IB_LITERAL%/backups") -Filter 'update_*' | Select-Object -First 1
    [IO.File]::SetAttributes((Join-Path $p.FullName 'atualizacao.log'),[IO.FileAttributes]::ReadOnly)
  }
}
$a.Start={param($svc) $script:events.Add('start')}
$a.Health={param($port)
  $script:events.Add('health:'+$port); $script:health++
  if($script:health -gt 1 -and $port -ne 3000){throw 'HTTP rollback na porta incorreta'}
  if($env:IB_CASE -eq 'rollback-failure' -or ($env:IB_CASE -eq 'health' -and $script:health -eq 1)){throw 'HTTP fixture falhou.'}
}
$a.Confirm={param($message) return $false}
$local=if($env:IB_CASE -eq 'remote-success'){$null}else{Join-Path $fixture "source d'operador & equipe! %IB_LITERAL%"}
$held=$null
if($env:IB_CASE -eq 'locked'){
  $folder=Join-Path $fixture "app d'operador & equipe! %IB_LITERAL%/backups"
  [IO.Directory]::CreateDirectory($folder)|Out-Null
  $held=[IO.File]::Open((Join-Path $folder 'atualizacao.lock'),'OpenOrCreate','ReadWrite','None')
}
$result=Invoke-IBUpdate -ApplicationDirectory (Join-Path $fixture "app d'operador & equipe! %IB_LITERAL%") -SourceDirectory $local -Actions $a
if($held){$held.Dispose()}
[IO.File]::WriteAllText((Join-Path $fixture 'result.json'),(@{Code=$result;Events=@($script:events)}|ConvertTo-Json -Depth 4))
exit $result
`;

function fixture(t, scenario) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'infoboard-workflow-'));
  t.after(() => {
    const real = fs.realpathSync(dir);
    assert.equal(path.dirname(real).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
    assert.match(path.basename(real), /^infoboard-workflow-/);
    fs.rmSync(real, { recursive: true, force: true });
  });
  const app = path.join(dir, "app d'operador & equipe! %IB_LITERAL%");
  const source = path.join(dir, "source d'operador & equipe! %IB_LITERAL%");
  const write = (base, rel, content) => {
    const p = path.join(base, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  for (const [base, version] of [[app, '1.0.0'], [source, releaseVersion]]) {
    write(base, 'package.json', JSON.stringify({ name: 'infoboard', version }));
    write(base, 'package-lock.json', '{}');
    write(base, 'server.js', `// ${version}`);
  }
  write(app, '.env', 'PORT=3001\nFIXTURE_SECRET=not-for-logs');
  write(app, 'config/analysts_map.json', '{"local":true}');
  write(app, 'node_modules/dependency.txt', 'old-dependency');
  write(app, 'daemon/fixture.exe', 'fixture-only');
  write(app, 'daemon/fixture.xml', '<service><executable>old-node.exe</executable><env name="PORT" value="3000"/></service>');
  write(source, 'config/analysts_map.json', '{"foreign":true}');
  write(source, '.env', 'FORBIDDEN=foreign');
  write(source, '.env.backup', 'FORBIDDEN=foreign');
  write(source, 'private.env', 'FORBIDDEN=foreign');
  write(source, '.git_old/private', 'FORBIDDEN');
  write(source, '.agents/local/secret.txt', 'FORBIDDEN');
  write(source, '.maestri/local.json', 'FORBIDDEN');
  write(source, 'agent-skills/internal/SKILL.md', 'FORBIDDEN');
  write(source, 'AGENTS.md', 'FORBIDDEN');
  write(source, 'MAESTRI-POLITICA-OPERACIONAL.md', 'FORBIDDEN');
  write(source, 'docs/re/internal.md', 'FORBIDDEN');
  write(source, 'scripts/instalar-skills-davi.mjs', 'FORBIDDEN');
  write(source, 'public/new.js', 'new-file');
  write(source, '.github/workflows/check.yml', 'public-workflow');
  write(dir, 'npm home/npm.cmd', 'fixture-only');
  write(dir, 'npm home/node_modules/npm/bin/npm-cli.js', `const fs=require('node:fs');const path=require('node:path');const dest=process.argv[process.argv.indexOf('--prefix')+1];fs.mkdirSync(path.join(dest,'node_modules'),{recursive:true});fs.writeFileSync(path.join(dest,'node_modules/dependency.txt'),'new-dependency');process.stderr.write('npm WARN fixture');process.exit(${scenario === 'native-failure' ? 9 : 0});`);
  if (scenario === 'package') fs.unlinkSync(path.join(source, 'package-lock.json'));
  if (scenario === 'downgrade') write(source, 'package.json', '{"name":"infoboard","version":"0.9.0"}');
  if (scenario === 'real-npm') {
    write(source, 'package.json', fs.readFileSync(path.join(root, 'package.json')));
    write(source, 'package-lock.json', fs.readFileSync(path.join(root, 'package-lock.json')));
  }
  if (scenario === 'remote-success') {
    const archiveRoot = path.join(dir, 'archive');
    const name = 'Infoboard-' + 'a'.repeat(40);
    fs.mkdirSync(archiveRoot);
    fs.cpSync(source, path.join(archiveRoot, name), { recursive: true });
    execFileSync('tar', ['-a', '-cf', path.join(dir, 'download.zip'), '-C', archiveRoot, name], { stdio: 'pipe' });
  }
  const env = { ...process.env, IB_LITERAL: 'MUST_NOT_EXPAND', IB_FIXTURE_NODE: process.execPath, IB_CORE: path.join(root, 'instalador/ATUALIZAR_INFOBOARD.bat'), IB_FIXTURE: dir, IB_FIXTURE_PARENT: path.dirname(dir), IB_CASE: scenario };
  for (const key of Object.keys(env)) if (/^PSModulePath$/i.test(key)) delete env[key];
  const run = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', harness], { env, encoding: 'utf8', timeout: scenario === 'real-npm' ? 180000 : 40000 });
  assert.equal(run.error, undefined);
  assert.ok(fs.existsSync(path.join(dir, 'result.json')), run.stderr || run.stdout);
  return { dir, app, source, run, result: JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8')) };
}

test('atualizador real prepara, protege, atualiza e valida sem perder configuracao', { skip: process.platform !== 'win32' }, t => {
  const { app, run, result } = fixture(t, 'success');
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.deepEqual(result.Events, ['runtime', 'npm', 'service', 'stop', 'start', 'health:3001']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(app, 'package.json'))).version, releaseVersion);
  assert.equal(fs.readFileSync(path.join(app, '.env'), 'utf8'), 'PORT=3001\nFIXTURE_SECRET=not-for-logs');
  assert.equal(fs.readFileSync(path.join(app, 'config/analysts_map.json'), 'utf8'), '{"local":true}');
  assert.equal(fs.readFileSync(path.join(app, 'node_modules/dependency.txt'), 'utf8'), 'new-dependency');
  assert.match(fs.readFileSync(path.join(app, 'daemon/fixture.xml'), 'utf8'), /value="3001"/);
  assert.ok(fs.existsSync(path.join(app, '.github/workflows/check.yml')));
  for (const forbidden of ['.git_old', '.env.backup', 'private.env', '.agents', '.maestri', 'agent-skills', 'AGENTS.md', 'MAESTRI-POLITICA-OPERACIONAL.md', 'docs/re', 'scripts/instalar-skills-davi.mjs']) assert.equal(fs.existsSync(path.join(app, forbidden)), false);
  const work = path.join(app, 'backups', fs.readdirSync(path.join(app, 'backups')).find(x => x.startsWith('update_')));
  assert.equal(fs.readFileSync(path.join(work, 'configuracao.env'), 'utf8'), fs.readFileSync(path.join(app, '.env'), 'utf8'));
  assert.equal(fs.readFileSync(path.join(work, 'mapa-analistas.json'), 'utf8'), '{"local":true}');
  assert.equal(fs.readFileSync(path.join(work, 'previous-node_modules/dependency.txt'), 'utf8'), 'old-dependency');
  const log = fs.readFileSync(path.join(work, 'atualizacao.log'), 'utf8');
  assert.match(log, /ETAPA 8\/8.*CONCLUIDA/);
  assert.doesNotMatch(log + run.stdout + run.stderr, /not-for-logs|FORBIDDEN/);
});

for (const scenario of ['package', 'npm', 'reboot', 'downgrade', 'native-failure', 'locked']) {
  test(`falha ${scenario} antes da parada preserva versao e dependencias`, { skip: process.platform !== 'win32' }, t => {
    const { app, run, result } = fixture(t, scenario);
    assert.equal(result.Code, scenario === 'reboot' ? 3010 : 1, run.stderr + run.stdout);
    assert.equal(result.Events.includes('stop'), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(app, 'package.json'))).version, '1.0.0');
    assert.equal(fs.readFileSync(path.join(app, 'node_modules/dependency.txt'), 'utf8'), 'old-dependency');
    assert.doesNotMatch(run.stdout, /SUCESSO:/);
  });
}

test('npm nativo com WARN em stderr e exit 0 nao vira erro no PowerShell 5', { skip: process.platform !== 'win32' }, t => {
  const { app, run, result } = fixture(t, 'native-warning');
  assert.equal(result.Code, 0, run.stderr + run.stdout);
  assert.equal(JSON.parse(fs.readFileSync(path.join(app, 'package.json'))).version, releaseVersion);
  const work = path.join(app, 'backups', fs.readdirSync(path.join(app, 'backups')).find(x => x.startsWith('update_')));
  assert.match(fs.readFileSync(path.join(work, 'npm.log'), 'utf8'), /npm WARN fixture/);
});

test('arquivo unico usa caminho remoto de revisao fixa e aplica ZIP antes preparado', { skip: process.platform !== 'win32' }, t => {
  const { app, run, result } = fixture(t, 'remote-success');
  assert.equal(result.Code, 0, run.stderr + run.stdout);
  assert.deepEqual(result.Events.slice(0, 2), ['remote-head', 'remote-zip']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(app, 'package.json'))).version, releaseVersion);
  assert.equal(fs.readFileSync(path.join(app, '.env'), 'utf8'), 'PORT=3001\nFIXTURE_SECRET=not-for-logs');
});

test('npm real prepara dependencias do lockfile no staging e troca a arvore isolada', {
  skip: process.platform !== 'win32' || process.env.INFOBOARD_INSTALLER_NETWORK_TEST !== 'true'
}, t => {
  const { app, run, result } = fixture(t, 'real-npm');
  assert.equal(result.Code, 0, run.stderr + run.stdout);
  assert.ok(fs.existsSync(path.join(app, 'node_modules/express/package.json')));
  assert.ok(fs.existsSync(path.join(app, 'node_modules/node-windows/package.json')));
  assert.equal(fs.readFileSync(path.join(app, '.env'), 'utf8'), 'PORT=3001\nFIXTURE_SECRET=not-for-logs');
});

test('perda do log apos parada nao impede tentativa de rollback', { skip: process.platform !== 'win32' }, t => {
  const { app, run, result } = fixture(t, 'log-loss');
  assert.equal(result.Code, 1, run.stderr + run.stdout);
  assert.deepEqual(result.Events.slice(-3), ['stop', 'start', 'health:3000']);
  assert.match(run.stdout, /AVISO LOG/);
  assert.match(run.stdout, /ROLLBACK\] CONCLUIDO/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(app, 'package.json'))).version, '1.0.0');
  const work = path.join(app, 'backups', fs.readdirSync(path.join(app, 'backups')).find(x => x.startsWith('update_')));
  fs.chmodSync(path.join(work, 'atualizacao.log'), 0o666);
});

test('HTTP falha e rollback real recupera fontes, remove novos arquivos e restaura deps sem rede', { skip: process.platform !== 'win32' }, t => {
  const { app, run, result } = fixture(t, 'health');
  assert.equal(result.Code, 1, run.stderr + run.stdout);
  assert.equal(JSON.parse(fs.readFileSync(path.join(app, 'package.json'))).version, '1.0.0');
  assert.equal(fs.readFileSync(path.join(app, 'node_modules/dependency.txt'), 'utf8'), 'old-dependency');
  assert.match(fs.readFileSync(path.join(app, 'daemon/fixture.xml'), 'utf8'), /old-node\.exe/);
  assert.match(fs.readFileSync(path.join(app, 'daemon/fixture.xml'), 'utf8'), /value="3000"/);
  assert.equal(fs.existsSync(path.join(app, 'public/new.js')), false);
  assert.equal(fs.existsSync(path.join(app, '.github/workflows/check.yml')), false);
  assert.equal(result.Events.filter(x => x === 'npm').length, 1);
  assert.deepEqual(result.Events.slice(-3), ['stop', 'start', 'health:3000']);
  assert.match(run.stdout, /ROLLBACK\] CONCLUIDO/);
  assert.doesNotMatch(run.stdout, /SUCESSO:/);
});

test('falha tambem no rollback termina com codigo distinto sem sucesso falso', { skip: process.platform !== 'win32' }, t => {
  const { run, result } = fixture(t, 'rollback-failure');
  assert.equal(result.Code, 2, run.stderr + run.stdout);
  assert.match(run.stdout, /ROLLBACK FALHOU/);
  assert.doesNotMatch(run.stdout, /SUCESSO:/);
});
