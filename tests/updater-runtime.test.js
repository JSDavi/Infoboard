const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildUpdater } = require('../scripts/build-installers.cjs');
const root = path.resolve(__dirname, '..');

test('BAT distribuido corresponde ao gerador e contem Node e fluxo completos', () => {
  const helper = fs.readFileSync(path.join(root, 'instalador/ensure-node.ps1'), 'utf8');
  const bat = fs.readFileSync(path.join(root, 'instalador/ATUALIZAR_INFOBOARD.bat'), 'utf8');
  assert.equal(bat, buildUpdater(helper));
  assert.match(bat, /function Invoke-IBEnsureNode/);
  assert.match(bat, /function Invoke-IBUpdate/);
  assert.doesNotMatch(bat, /ExecutionPolicy|taskkill|git pull/i);
});

test('launcher CMD aceita espacos/apostrofo e retorna falha mesmo com auto-sobrescrita', { skip: process.platform !== 'win32' }, t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'infoboard-launcher-'));
  t.after(() => {
    const real = fs.realpathSync(dir);
    assert.equal(path.dirname(real).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
    assert.match(path.basename(real), /^infoboard-launcher-/);
    fs.rmSync(real, { recursive: true, force: true });
  });
  // Este teste exercita o launcher real com uma entrada inofensiva. Os testes de
  // workflow separados exercitam o payload real com adaptadores de SO isolados.
  const bat = fs.readFileSync(path.join(root, 'instalador/ATUALIZAR_INFOBOARD.bat'), 'utf8');
  const substitute = String.raw`
function Start-IBUpdater([string]$Self) {
  [IO.File]::WriteAllText($Self, '@echo off' + [Environment]::NewLine + 'exit /b 99')
  Write-Host 'LAUNCHER_MEMORY_OK'
  return 23
}
`;
  const file = path.join(dir, "Atualizador d'operador & equipe!.bat");
  fs.writeFileSync(file, bat.replace(/\r?\n# INFOBOARD_PAYLOAD_END/, '\r\n' + substitute + '\r\n# INFOBOARD_PAYLOAD_END'));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^PSModulePath$/i.test(key)) delete env[key];
  const run = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${file}""`], {
    env, windowsVerbatimArguments: true, encoding: 'utf8', timeout: 15000
  });
  assert.equal(run.error, undefined);
  assert.equal(run.status, 23, run.stderr + run.stdout);
  assert.match(run.stdout, /LAUNCHER_MEMORY_OK/);
  assert.match(fs.readFileSync(file, 'utf8'), /exit \/b 99/);
});
