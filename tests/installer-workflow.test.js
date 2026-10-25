const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { copyLocalInstallation } = require('../scripts/copy-local-install.cjs');

const root = path.resolve(__dirname, '..');

test('instalador usa Node >=22 com npm e instalacao LTS validada; instalacao permanece em 3000', () => {
  const bat = fs.readFileSync(path.join(root, 'instalador/INSTALAR_INFOBOARD.bat'), 'utf8');
  assert.match(bat, /Invoke-IBEnsureNode/);
  assert.match(bat, /ensure-node\.ps1/);
  assert.doesNotMatch(bat, /v20\.18\.0|nodejs_installer\.msi|robocopy/i);
  assert.match(bat, /PORT=3000/);
  assert.match(bat, /LocalPort 3000/);
  assert.match(bat, /localhost:3000/);
  assert.doesNotMatch(bat, /PORT=3001|localhost:3001/);
  assert.match(bat, /copy-local-install\.cjs/);
  assert.match(bat, /npm ci --omit=dev/);
  assert.match(bat, /package-lock\.json/);
  assert.doesNotMatch(bat, /npm install --omit=dev|ExecutionPolicy\s+Bypass|git\s+.*clone|net stop "Infoboard/i);
  assert.match(bat, /Get-CimInstance Win32_Service/);
  assert.match(bat, /Fonte local ausente/);
});

test('copia local instala fontes sem arquivos privados, agentes ou ferramentas locais', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'infoboard-install-copy-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const from = path.join(folder, 'source');
  const to = path.join(folder, 'installed');
  function write(base, name, content) {
    const full = path.join(base, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  write(from, 'server.js', 'runtime');
  write(from, 'package.json', '{"name":"infoboard"}');
  write(from, 'public/app.js', 'public');
  write(from, 'instalador/ensure-node.ps1', 'helper');
  for (const name of [
    '.env', '.env.old', '.agents/rules.md', '.maestri/agents.json',
    'AGENTS.md', 'MAESTRI-POLITICA-OPERACIONAL.md', 'agent-skills/secret.txt',
    'docs/re/notes.txt', 'docs/auditoria/check.txt',
    'config/analysts_map.json', 'backups/private.env', 'node_modules/private.txt',
    '.git/config', 'daemon/service.exe', 'instalador/REINICIAR_PRODUCAO.bat'
  ]) write(from, name, 'PRIVATE');
  write(to, '.env', 'PORT=3000\nLOCAL_SECRET=preserve');
  write(to, 'config/analysts_map.json', '{"local":true}');
  const count = copyLocalInstallation(from, to);
  assert.equal(count, 4);
  assert.equal(fs.readFileSync(path.join(to, 'server.js'), 'utf8'), 'runtime');
  assert.equal(fs.readFileSync(path.join(to, 'public/app.js'), 'utf8'), 'public');
  assert.equal(fs.readFileSync(path.join(to, '.env'), 'utf8'), 'PORT=3000\nLOCAL_SECRET=preserve');
  assert.equal(fs.readFileSync(path.join(to, 'config/analysts_map.json'), 'utf8'), '{"local":true}');
  assert.equal(fs.existsSync(path.join(to, '.agents')), false);
  assert.equal(fs.existsSync(path.join(to, '.maestri')), false);
  assert.equal(fs.existsSync(path.join(to, 'docs/re')), false);
  assert.equal(fs.existsSync(path.join(to, 'backups')), false);
  assert.equal(fs.existsSync(path.join(to, '.git')), false);
  assert.equal(fs.existsSync(path.join(to, 'AGENTS.md')), false);
  assert.throws(() => copyLocalInstallation(from, path.join(from, 'nested')), /pastas separadas/);
});

test('trecho CMD real do instalador aceita runtime e interrompe quando precisa reiniciar', { skip: process.platform !== 'win32' }, t => {
  const policy = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Get-ExecutionPolicy'], {
    encoding: 'utf8', timeout: 10000
  });
  assert.equal(policy.error, undefined);
  const value = policy.stdout.trim();
  if (policy.status !== 0 || !/^(RemoteSigned|Unrestricted|Bypass)$/i.test(value)) {
    t.skip(`Politica PowerShell nao permite validar a execucao de .ps1 (valor: ${value || 'indisponivel'}); politica preservada.`);
    return;
  }
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'infoboard-installer-stage-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const bat = fs.readFileSync(path.join(root, 'instalador/INSTALAR_INFOBOARD.bat'), 'utf8');
  const start = bat.indexOf(':ETAPA_1');
  const end = bat.indexOf(':: ETAPA 2/6:', start);
  assert.ok(start > 0 && end > start);
  const stage = bat.slice(start, end);
  const testBat = path.join(folder, 'installer-stage.bat');
  fs.writeFileSync(testBat, [
    '@echo off', 'setlocal EnableDelayedExpansion',
    stage, 'echo IB_STAGE_SUCCESS', 'exit /b 0',
    ':ERRO_FATAL', 'echo IB_STAGE_FAILURE', 'exit /b 1'
  ].join('\r\n'));
  fs.writeFileSync(path.join(folder, 'ensure-node.ps1'), [
    'function Invoke-IBEnsureNode {',
    '  param([string]$LogDirectory)',
    '  return [pscustomobject]@{ NodePath=$env:IB_FAKE_NODE; RebootRequired=($env:IB_FAKE_REBOOT -eq "1") }',
    '}'
  ].join('\r\n'));
  function check(reboot) {
    const env = {
      ...process.env, SCRIPT_DIR: folder, IB_FAKE_NODE: process.execPath,
      IB_FAKE_REBOOT: reboot ? '1' : '0', C_GREEN: '', C_CYAN: '', C_RESET: '',
      LOCALAPPDATA: folder
    };
    for (const key of Object.keys(env)) if (/^PSModulePath$/i.test(key)) delete env[key];
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${testBat}""`], {
      env, windowsVerbatimArguments: true, encoding: 'utf8', timeout: 15000
    });
  }
  const ok = check(false);
  assert.equal(ok.error, undefined);
  assert.equal(ok.status, 0, ok.stderr + ok.stdout);
  assert.match(ok.stdout, /IB_STAGE_SUCCESS/);
  assert.match(ok.stdout, /Node.js e npm compativeis:/);
  const pending = check(true);
  assert.equal(pending.error, undefined);
  assert.equal(pending.status, 1, pending.stderr + pending.stdout);
  assert.match(pending.stdout, /IB_STAGE_FAILURE/);
  assert.doesNotMatch(pending.stdout, /IB_STAGE_SUCCESS/);
});
