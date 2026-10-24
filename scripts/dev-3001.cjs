// Homologacao local: porta 3001 com as integracoes reais configuradas no .env.
const path = require('node:path');
const net = require('node:net');

process.chdir(path.resolve(__dirname, '..'));
Object.assign(process.env, {
  PORT: '3001',
  ENABLE_TELEGRAM_ALERTS: 'false',
  LOG_LEVEL: 'warn',
  // Somente em homologacao: fila NPX nao equivale a registro SIP.
  INFOBOARD_NPX_REQUIRE_SIP_CONFIRMATION: 'true'
});

// Confere o conflito antes de ativar os coletores de API deste processo.
const probe = net.createServer();
probe.once('error', err => {
  console.error(`[InfoBoard] Porta 3001 indisponivel (${err.code || err.message}). Identifique o processo antes de iniciar outra instancia.`);
  process.exitCode = 1;
});
probe.listen(3001, '0.0.0.0', () => probe.close(() => require('../server.js')));
