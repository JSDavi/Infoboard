const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { uninstallServices } = require('../instalador/uninstall_service.js');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'instalador/install_service.js'), 'utf8');

function simulate(mode, envPort = '3001') {
  const state = { output: [], exit: null, cleared: false };
  class Service extends EventEmitter {
    constructor(options) { super(); state.options = options; }
    install() { if (mode === 'already') this.emit('alreadyinstalled'); else if (mode !== 'hang') this.emit('install'); }
    start() {
      if (mode === 'error') this.emit('error', { code: 'EACCES', message: 'FIXTURE_SECRET' });
      else this.emit('start');
    }
  }
  const context = {
    __dirname: path.join(root, 'instalador'),
    require(name) {
      if (name === 'node-windows') return { Service };
      if (name === 'fs') return { existsSync: () => false, readFileSync: () => Buffer.from(`PORT=${envPort}\n`) };
      return require(name);
    },
    process: { env: { PORT: '3000' }, execPath: 'C:\\validated-node\\node.exe', exit(code) { state.exit = code; throw new Error('FIXTURE_EXIT'); } },
    console: { log: (...a) => state.output.push(a.join(' ')), error: (...a) => state.output.push(a.join(' ')) },
    setTimeout(callback) { state.timeout = callback; return {}; },
    clearTimeout() { state.cleared = true; }
  };
  try { vm.runInNewContext(source, context); }
  catch (e) { if (e.message !== 'FIXTURE_EXIT') throw e; }
  return state;
}

test('servico usa Node validado, raiz e PORT do .env em vez da porta herdada', () => {
  const state = simulate('success');
  assert.equal(state.options.execPath, 'C:\\validated-node\\node.exe');
  assert.equal(state.options.workingDirectory, root);
  assert.equal(state.options.env[0].value, '3001');
  assert.equal(state.cleared, true);
  assert.equal(state.exit, null);
  assert.match(state.output.join('\n'), /ainda deve validar o HTTP/);
});

test('erro assincrono do servico retorna 1 sem imprimir objeto com dados privados', () => {
  const state = simulate('error');
  assert.equal(state.exit, 1);
  assert.equal(state.cleared, true);
  assert.doesNotMatch(state.output.join('\n'), /FIXTURE_SECRET/);
  assert.match(state.output.join('\n'), /EACCES/);
});

test('servico existente nao e iniciado por uma instalacao nova', () => {
  const state = simulate('already');
  assert.equal(state.exit, 1);
  assert.equal(state.cleared, true);
  assert.doesNotMatch(state.output.join('\n'), /SUCESSO|Iniciando/);
});

test('PORT invalida para antes de registrar servico', () => {
  const state = simulate('success', '99999');
  assert.equal(state.exit, 1);
  assert.equal(state.options, undefined);
});

test('registro sem evento terminal tem prazo e falha explicita', () => {
  const state = simulate('hang');
  assert.throws(() => state.timeout(), /FIXTURE_EXIT/);
  assert.equal(state.exit, 1);
  assert.match(state.output.join('\n'), /90s/);
});

test('entrada tecnica de remocao passa raiz validada sem nomes globais node-windows', () => {
  let called = false;
  const result = uninstallServices(root, (exe, args, options) => {
    called = true;
    assert.equal(exe, 'powershell.exe');
    assert.equal(options.env.IB_SERVICE_ROOT, root);
    assert.match(args.at(-1), /StartsWith\(\$root\+'\\'/);
    assert.doesNotMatch(args.join(' '), /ExecutionPolicy|taskkill/i);
    return 'fixture';
  });
  assert.equal(called, true);
  assert.equal(result, 'fixture');
});
