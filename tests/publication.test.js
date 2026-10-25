const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sourceFiles } = require('../scripts/publication-files.cjs');
const { inspect, auditTree } = require('../scripts/audit-publication.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'infoboard-publication-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const write = (relative, value) => {
    const target = path.join(directory, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, value);
  };
  return { directory, write };
}

test('distribuicao preserva fontes e exclui credenciais, dados reais e historico', t => {
  const { directory, write } = fixture(t);
  for (const file of ['.env', '.env.production', 'config/analysts_map.json', 'backups/old.zip',
    'daemon/service.xml', '.git/config', '.maestri/session.json', '.agents/report.md',
    '.git_old/objects/private', '.git-backup/config', '.git.backup/HEAD', 'mirror.git/objects/private',
    'env-before.env', 'Infoboard_env_backup.env',
    'docs/re/raw/network.json', 'docs/re/openapi.yaml', 'docs/auditoria/internal-findings.md',
    'instalador/GUIA_OPERACAO.md', 'instalador/REINICIAR_PRODUCAO.bat',
    'REINICIAR_PRODUCAO.bat', 'test_queues_live.js', 'test_login_wrong.js', 'test_rules.js',
    'agent-skills/maestri-review/SKILL.md', 'AGENTS.md', 'MAESTRI-POLITICA-OPERACIONAL.md',
    '--prefix/node_modules/dependency.txt', 'scripts/alinha-perfis-skills-maestri.mjs',
    'scripts/configure-global-agent-defaults.ps1', 'scripts/instalar-skills-davi.mjs',
    'scripts/instalar-skills-india.mjs', 'scripts/repair-codex-launchers.ps1']) write(file, 'private fixture');
  for (const file of ['.env.example', 'server.js', 'public/index.html', 'public/happy_hour_bg.jpg',
    'config/analysts_map.example.json', 'instalador/install_service.js',
    'scripts/build-installers.cjs', 'scripts/publication-files.cjs', 'scripts/dev-3001.cjs',
    'docs/SEGURANCA.md']) write(file, 'public fixture');
  assert.deepEqual(sourceFiles(directory), ['.env.example', 'config/analysts_map.example.json',
    'docs/SEGURANCA.md', 'instalador/install_service.js', 'public/happy_hour_bg.jpg',
    'public/index.html', 'scripts/build-installers.cjs', 'scripts/dev-3001.cjs',
    'scripts/publication-files.cjs', 'server.js']);
});

test('protecao de copias Git nao exclui workflows GitHub nem .gitignore', t => {
  const { directory, write } = fixture(t);
  for (const file of ['.github/workflows/verify.yml', '.gitignore', '.gitattributes']) write(file, 'public fixture');
  assert.deepEqual(sourceFiles(directory), ['.gitattributes', '.github/workflows/verify.yml', '.gitignore']);
});

test('triagem detecta segredo local e variante URL sem imprimir o valor', t => {
  const { directory, write } = fixture(t);
  const secret = 'fixture-password+with-special/chars';
  write('.env', `PBX_API_TOKEN="${secret}"\n`);
  write('leak.js', `const one = '${secret}'; const two = '${encodeURIComponent(secret)}';`);
  const report = auditTree(directory);
  assert.deepEqual(report.findings, [{ file: 'leak.js', category: 'valor configurado em PBX_API_TOKEN' }]);
  assert.ok(!JSON.stringify(report).includes(secret));
  assert.ok(!JSON.stringify(report).includes(encodeURIComponent(secret)));
});

test('triagem reconhece chave privada sem depender de .env local', () => {
  const sample = Buffer.from(['-----BEGIN ', 'PRIVATE KEY-----', '\nfixture'].join(''));
  assert.deepEqual(inspect('accidental.txt', sample), [{ file: 'accidental.txt', category: 'chave privada' }]);
});
