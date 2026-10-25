const Service = require('node-windows').Service;
const path = require('path');
const fs = require('fs');

// Identifica a raiz do projeto (esteja o script dentro de instalador/ ou na raiz)
const projectRoot = fs.existsSync(path.join(__dirname, 'server.js')) 
  ? __dirname 
  : path.join(__dirname, '..');

const config = require('dotenv').parse(fs.readFileSync(path.join(projectRoot, '.env')));
const port = Number(config.PORT || process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('[ERRO SERVICO] PORT invalida no .env. Corrija a porta antes de instalar.');
  process.exit(1);
}
// O node-windows grava o executavel no XML do wrapper. Fixar o mesmo Node que
// passou na validacao do instalador e usar a raiz como diretorio de trabalho.
const timeout = setTimeout(() => {
  console.error('[ERRO SERVICO] Tempo limite de 90s. Confira services.msc e os logs do wrapper.');
  process.exit(1);
}, 90000);

// Cria o objeto do servico nativo do Windows
const svc = new Service({
  name: 'Infoboard TV',
  description: 'Servico nativo do Windows para o Painel Infoboard TV (NPX, PrixChat e PBX)',
  script: path.join(projectRoot, 'server.js'),
  execPath: process.execPath,
  workingDirectory: projectRoot,
  env: [
    {
      name: "PORT",
      value: String(port)
    }
  ],
  wait: 2,
  grow: 0.25,
  maxRetries: 50
});

// Evento disparado quando a instalacao termina
svc.on('install', function() {
  console.log('================================================================');
  console.log('[SUCESSO] Servico nativo "Infoboard TV" instalado no Windows!');
  console.log('Voce pode visualiza-lo no painel de servicos: services.msc');
  console.log('================================================================');
  svc.start();
});

svc.on('alreadyinstalled', function() {
  clearTimeout(timeout);
  console.error('[ERRO SERVICO] Ja existe um servico Infoboard no Windows. Confira services.msc e utilize o atualizador da instalacao correspondente.');
  process.exit(1);
});

svc.on('start', function() {
  clearTimeout(timeout);
  console.log(`[OK] Inicio do servico confirmado; porta configurada: ${port}. O instalador ainda deve validar o HTTP.`);
});

svc.on('error', function(err) {
  clearTimeout(timeout);
  console.error('[ERRO SERVICO] Falha ao registrar/iniciar. Codigo:', String(err?.code || 'SCM_ERROR'));
  process.exit(1);
});

console.log('Instalando o Infoboard como um Servico nativo do Windows (services.msc)...');
svc.install();
