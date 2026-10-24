const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const express = require('express');

// Executa o servidor real com timers suspensos e transporte substituido.
// Assim nenhum teste le .env, autentica em provedores ou abre coleta externa.
async function serverFixture(options = {}) {
  const projectRoot = path.resolve(__dirname, '../..');
  const root = options.root ? path.resolve(options.root) : projectRoot;
  const projectRequire = createRequire(path.join(projectRoot, 'server.js'));
  let server;
  const wrappedExpress = Object.assign(() => {
    const app = express();
    const listen = app.listen.bind(app);
    app.listen = (_port, callback) => {
      server = listen(0, '127.0.0.1', callback);
      return server;
    };
    return app;
  }, express);
  const noNetwork = () => { throw new Error('Teste tentou acessar um provedor externo'); };
  const requireFixture = name => {
    if (name === 'express') return wrappedExpress;
    if (name === 'dotenv') return { config() {} };
    if (name === 'axios') return options.axios || { get: noNetwork, post: noNetwork };
    // Permite comparar snapshot anterior que tinha apenas o import inerte.
    if (name === 'cors') return () => (_req, _res, next) => next();
    if (name.startsWith('./')) return projectRequire(path.resolve(root, name));
    return projectRequire(name);
  };
  const context = vm.createContext({
    require: requireFixture, __dirname: root,
    process: { env: { ...options.env, PORT: '0', NODE_ENV: 'test' }, on() {}, exit(code) { throw new Error(`Exit ${code}`); } },
    console: { log() {}, warn() {}, error() {} },
    URL, URLSearchParams, Buffer,
    setTimeout: () => ({ unref() {} }), setInterval: () => ({ unref() {} }), clearTimeout() {}
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), context, { filename: 'server.js' });
  await new Promise((resolve, reject) => {
    if (server.listening) resolve();
    else { server.once('listening', resolve); server.once('error', reject); }
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    evaluate: source => vm.runInContext(source, context),
    close: () => new Promise(resolve => server.close(resolve))
  };
}

module.exports = { serverFixture };
