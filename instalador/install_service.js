const Service = require('node-windows').Service;
const path = require('path');
const fs = require('fs');

// Identifica a raiz do projeto (esteja o script dentro de instalador/ ou na raiz)
const projectRoot = fs.existsSync(path.join(__dirname, 'server.js')) 
  ? __dirname 
  : path.join(__dirname, '..');

// Cria o objeto do servico nativo do Windows
const svc = new Service({
  name: 'Infoboard TV',
  description: 'Servico nativo do Windows para o Painel Infoboard TV (NPX, PrixChat e PBX)',
  script: path.join(projectRoot, 'server.js'),
  env: [
    {
      name: "PORT",
      value: "3000"
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
  console.log('[AVISO] O servico ja esta instalado no Windows. Iniciando...');
  svc.start();
});

svc.on('start', function() {
  console.log('[OK] Servico iniciado e rodando em segundo plano na porta 3000!');
});

svc.on('error', function(err) {
  console.error('[ERRO no Servico]:', err);
});

console.log('Instalando o Infoboard como um Servico nativo do Windows (services.msc)...');
svc.install();
