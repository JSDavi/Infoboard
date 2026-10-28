const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { readInstallationInfo, METADATA_NAME } = require('../installation-info');
const { recordInstallation } = require('../scripts/record-installation.cjs');
const { sourceFiles } = require('../scripts/publication-files.cjs');
const { serverFixture } = require('./helpers/server-fixture.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(__dirname, '.version-fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"infoboard","version":"1.2.3"}');
  return root;
}

test('versao instalada acompanha package.json; data somente quando registrada para essa versao', t => {
  const root = fixture(t);
  assert.deepEqual(readInstallationInfo(root), { version: '1.2.3', installedAt: null });
  fs.writeFileSync(path.join(root, METADATA_NAME), '{"version":"1.2.2","installedAt":"2026-10-20T16:00:00.000Z"}');
  assert.equal(readInstallationInfo(root).installedAt, null);
  fs.writeFileSync(path.join(root, METADATA_NAME), '{"version":"1.2.3","installedAt":"data invalida"}');
  assert.equal(readInstallationInfo(root).installedAt, null);
});

test('instalador renova data a cada instalacao, inclusive da mesma versao', t => {
  const root = fixture(t);
  const first = new Date('2026-10-28T11:22:00.000Z');
  const next = new Date('2026-10-29T14:10:00.000Z');
  assert.deepEqual(recordInstallation(root, first), { version: '1.2.3', installedAt: first.toISOString() });
  assert.deepEqual(recordInstallation(root, next), { version: '1.2.3', installedAt: next.toISOString() });
  assert.deepEqual(readInstallationInfo(root), { version: '1.2.3', installedAt: next.toISOString() });
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"infoboard","version":"1.2.4"}');
  assert.equal(recordInstallation(root, next).installedAt, next.toISOString());
  assert.deepEqual(readInstallationInfo(root), { version: '1.2.4', installedAt: next.toISOString() });
  assert.equal(fs.readdirSync(root).filter(name => name.includes('.tmp')).length, 0);
  assert.ok(!sourceFiles(root).includes(METADATA_NAME), 'data da maquina nao deve ser distribuida');
});

test('indicador mostra versao legivel e data completa no tooltip', async () => {
  const script = fs.readFileSync(path.join(__dirname, '../public/version-display.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const currentVersion = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')).version;
  assert.ok(html.includes(`>Versão ${currentVersion}</span>`), 'fallback do HTML deve acompanhar a versao distribuida');
  const label = { textContent: 'Versão 1.2.3', title: '', setAttribute(name, value) { this[name] = value; } };
  let onLoad;
  let refresh;
  let version = '1.2.3';
  const sandbox = {
    document: {
      getElementById: () => label,
      addEventListener: (_event, callback) => { onLoad = callback; }
    },
    fetch: async (_url, options) => {
      assert.equal(options.cache, 'no-store');
      return { ok: true, json: async () => ({ version, installedAt: '2026-10-28T11:22:00.000Z' }) };
    },
    setInterval: (callback, period) => { assert.equal(period, 60_000); refresh = callback; },
    Intl, Date
  };
  vm.runInNewContext(script, sandbox);
  await onLoad();
  assert.equal(label.textContent, 'Versão 1.2.3');
  assert.match(label.title, /^Instalado\/atualizado em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}:\d{2}$/);
  assert.match(label['aria-label'], /^Versão 1\.2\.3\. Instalado\/atualizado em /);
  version = '1.2.4';
  await refresh();
  assert.equal(label.textContent, 'Versão 1.2.4', 'painel aberto também acompanha uma atualização');
});

test('falha da API preserva o numero da versao no cabecalho', async () => {
  const script = fs.readFileSync(path.join(__dirname, '../public/version-display.js'), 'utf8');
  const label = { textContent: 'Versão 1.2.3', title: '', setAttribute(name, value) { this[name] = value; } };
  let onLoad;
  vm.runInNewContext(script, {
    document: {
      getElementById: () => label,
      addEventListener: (_, callback) => { onLoad = callback; }
    },
    fetch: async () => { throw new Error('Servidor indisponível'); },
    Intl, Date
  });
  await onLoad();
  assert.equal(label.textContent, 'Versão 1.2.3');
  assert.match(label.title, /Não foi possível consultar a data/);
});

test('rota da API devolve versao real e somente permite rede autorizada', async t => {
  const local = await serverFixture();
  t.after(() => local.close());
  const route = local.evaluate("app._router.stack.find(layer => layer.route?.path === '/api/version').route.stack[0].handle");
  function invoke(ip) {
    const result = { code: 200, headers: {}, body: null };
    const res = {
      setHeader: (key, value) => { result.headers[key.toLowerCase()] = value; },
      status: code => { result.code = code; return res; },
      json: value => { result.body = value; return res; }
    };
    route({ headers: {}, socket: { remoteAddress: ip } }, res);
    return result;
  }
  const response = invoke('127.0.0.1');
  assert.equal(response.code, 200);
  assert.match(response.headers['cache-control'], /no-store/);
  assert.deepEqual(response.body, readInstallationInfo(path.join(__dirname, '..')));
  assert.equal(invoke('203.0.113.123').code, 401);
});
