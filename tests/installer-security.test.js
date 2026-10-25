const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const helper = path.join(root, 'instalador/protect-env.ps1');
function run(exe, args, extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of Object.keys(env)) if (/^PSModulePath$/i.test(key)) delete env[key];
  return execFileSync(exe, args, { env, stdio: 'pipe', encoding: 'utf8', timeout: 15000 });
}
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'infoboard-acl-test-'));
  t.after(() => {
    const real = fs.realpathSync(dir);
    assert.equal(path.dirname(real).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
    assert.match(path.basename(real), /^infoboard-acl-test-/);
    fs.rmSync(real, { recursive: true, force: true });
  });
  return dir;
}
// O helper .ps1 e testado no PowerShell disponivel que permite scripts locais.
// O fluxo BAT completo e testado separadamente no Windows PowerShell 5, sem
// ExecutionPolicy Bypass. Nao se altera politica nem se repete uma recusa.
function fileShell(t) {
  let exe;
  try { exe = run('where.exe', ['pwsh.exe']).trim().split(/\r?\n/)[0]; }
  catch { exe = 'powershell.exe'; }
  const policy = run(exe, ['-NoProfile', '-Command', 'Get-ExecutionPolicy']).trim();
  if (['Restricted', 'AllSigned'].includes(policy)) { t.skip(`Politica ${policy} impede executar este helper local; nao sera alterada.`); return null; }
  return exe;
}

test('helper real protege destino e copia bytes com apenas usuario e SYSTEM', { skip: process.platform !== 'win32' }, t => {
  const shell = fileShell(t);
  if (!shell) return;
  const dir = temporary(t);
  const from = path.join(dir, 'original.env');
  const to = path.join(dir, 'destino/configuracao.env');
  fs.writeFileSync(from, 'FIXTURE_PRIVATE=42\n');
  run(shell, ['-NoProfile', '-File', helper, '-Path', to, '-SourcePath', from]);
  assert.equal(fs.readFileSync(to, 'utf8'), 'FIXTURE_PRIVATE=42\n');
  const checked = JSON.parse(run(shell, ['-NoProfile', '-Command', `
    $a=Get-Acl -LiteralPath $env:IB_ENV
    [pscustomobject]@{Protected=$a.AreAccessRulesProtected;Current=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;
    Rules=@($a.Access | ForEach-Object {[pscustomobject]@{Sid=$_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;Rights=[string]$_.FileSystemRights;Inherited=$_.IsInherited;Type=[string]$_.AccessControlType}})} | ConvertTo-Json -Depth 5
  `], { IB_ENV: to }));
  assert.equal(checked.Protected, true);
  assert.deepEqual(checked.Rules.map(r => r.Sid).sort(), [checked.Current, 'S-1-5-18'].sort());
  for (const r of checked.Rules) {
    assert.equal(r.Rights, 'FullControl');
    assert.equal(r.Inherited, false);
    assert.equal(r.Type, 'Allow');
  }
});

test('origem ausente falha antes de criar ou modificar destino', { skip: process.platform !== 'win32' }, t => {
  const shell = fileShell(t);
  if (!shell) return;
  const dir = temporary(t);
  const target = path.join(dir, 'target.env');
  const args = ['-NoProfile', '-File', helper, '-Path', target, '-SourcePath', path.join(dir, 'absent.env')];
  assert.throws(() => run(shell, args), err => err.status === 1);
  assert.equal(fs.existsSync(target), false);
  fs.writeFileSync(target, 'PRESERVED');
  assert.throws(() => run(shell, args), err => err.status === 1);
  assert.equal(fs.readFileSync(target, 'utf8'), 'PRESERVED');
});

test('payload final do atualizador tem sintaxe PowerShell 5 valida', { skip: process.platform !== 'win32' }, () => {
  const bat = fs.readFileSync(path.join(root, 'instalador/ATUALIZAR_INFOBOARD.bat'), 'utf8');
  const start = bat.indexOf('\r\n# INFOBOARD_PAYLOAD_BEGIN');
  const end = bat.lastIndexOf('\r\n# INFOBOARD_PAYLOAD_END');
  assert.ok(start > 0 && end > start);
  run('powershell.exe', ['-NoProfile', '-Command', '$s=[IO.File]::ReadAllText($env:IB_BAT);$i=$s.IndexOf([Environment]::NewLine+\'# INFOBOARD_PAYLOAD_BEGIN\');$j=$s.LastIndexOf([Environment]::NewLine+\'# INFOBOARD_PAYLOAD_END\');$t=$null;$e=$null;$null=[Management.Automation.Language.Parser]::ParseInput($s.Substring($i,$j-$i),[ref]$t,[ref]$e);if(@($e).Count){exit 1}'], { IB_BAT: path.join(root, 'instalador/ATUALIZAR_INFOBOARD.bat') });
  for (const line of bat.slice(0, start).split(/\r?\n/)) assert.ok(line.length < 7900);
});

test('instalador mantem URL PBX canonica e verificacao TLS', () => {
  const bat = fs.readFileSync(path.join(root, 'instalador/INSTALAR_INFOBOARD.bat'), 'utf8');
  assert.match(bat, /https:\/\/sip33\.tsinfo\.net\.br/);
  assert.match(bat, /PBX_TLS_REJECT_UNAUTHORIZED=true/);
  assert.doesNotMatch(bat, /https:\/\/pbx\.nossatelecom\.com\.br/);
});

test('GUI preserva protecao de credenciais antes da gravacao e exclui env do ZIP', () => {
  const py = fs.readFileSync(path.join(root, 'instalador/setup_painel.py'), 'utf8');
  assert.match(py, /if file == '\.env' or file\.startswith\('\.env\.'\):\s*continue/);
  assert.match(py, /protect-env\.ps1/);
  assert.match(py, /res_acl\.returncode != 0/);
});
