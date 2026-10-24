const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('backend só publica a API de leitura e não importa módulos de comando', () => {
  const routes = [...server.matchAll(/\bapp\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)/g)]
    .map(([, verb, route]) => [verb, route]);
  assert.deepEqual(routes, [['get', '/api/data']]);
  assert.doesNotMatch(server, /require\(['"]\.\/npx-(?:session|switch|access-policy|queue-state|admin-access)['"]\)/);
  assert.match(server, /apiGet\('\/rates\/details_by_queue\.json'/);
  assert.match(server, /getPbxConnectionStatus\(\)/);
});

test('interface só consulta dados e não oferece login, troca de fila ou comandos de pausa', () => {
  assert.doesNotMatch(html, /id=['"]npx-(?:auth|pause)-modal['"]|id=['"]npx-login-btn['"]|type=['"]password['"]/i);
  assert.doesNotMatch(html, /\bonclick=['"][^'"]*(?:quickLoginQueue|sendNpxAction)/i);
  assert.doesNotMatch(app, /\b(?:sendNpxAction|saveNpxAuth|quickLoginQueue|openPauseModal|closeAuthModal)\b/);
  assert.doesNotMatch(app, /fetch\(['"]\/(?:api\/npx|api\/admin)/);
  assert.match(app, /fetch\(`\/api\/data\?t=\$\{Date\.now\(\)\}`/);
  assert.match(app, /buildPausePillHtml\(/);
  assert.doesNotMatch(css, /#npx-(?:pause|auth)-modal/);
});

test('cards de todos os status não indicam clique; métricas ficam restritas ao ícone', () => {
  assert.match(css, /\.analyst-card\s*\{[^}]*cursor:\s*default\s*;/s);
  assert.doesNotMatch(app, /card\.addEventListener\(['"]click['"]/);
  assert.match(app, /card\.querySelector\(['"]\.details-btn['"]\)\.addEventListener\(['"]click['"]/);
});

test('arquivos de controle de analista não fazem parte da execução', () => {
  const oldFiles = [
    'npx-session.js', 'npx-switch.js', 'npx-access-policy.js',
    'npx-queue-state.js', 'npx-admin-access.js', 'scripts/setup-npx-admin.cjs'
  ];
  for (const file of oldFiles) assert.equal(fs.existsSync(path.join(root, file)), false, file);
});
