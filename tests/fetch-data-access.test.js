const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const source = script.slice(script.indexOf('async function fetchData()'), script.indexOf('// Atualiza o Status de Conexão'));

test('resposta 401 limpa dados e mostra acesso restrito, sem pedir login', async () => {
  const rendered = [];
  const elements = new Map();
  const sandbox = {
    Date, lastChatData: { pending: [{ client: 'anterior' }] },
    document: { getElementById: id => {
      if (!elements.has(id)) elements.set(id, { style: {}, className: '', textContent: '' });
      return elements.get(id);
    } },
    fetch: async () => ({ status: 401, ok: false }),
    updateUI: data => rendered.push(data),
    setConnectionStatus: (...args) => { sandbox.connectionStatus = args; },
    startCountdownTimer() { throw new Error('Não iniciar contador sem autorização'); },
    console: { error() { throw new Error('401 não é falha de rede'); } }
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(source, context);
  await context.fetchData();
  assert.equal(sandbox.lastChatData, null);
  assert.equal(sandbox.loginUpdated, undefined);
  assert.equal(rendered.length, 1);
  assert.deepEqual(Object.values(rendered[0].departments).map(d => d.agents.length), [0, 0, 0, 0, 0]);
  assert.equal(rendered[0].prixchat.agents.length, 0);
  assert.equal(elements.get('npx-alert-message').textContent, 'Acesso à leitura permitido somente na rede interna autorizada.');
  assert.equal(sandbox.connectionStatus[2], 'ACESSO RESTRITO');
});
