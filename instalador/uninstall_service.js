const Service = require('node-windows').Service;
const path = require('path');

const projectRoot = path.join(__dirname, '..');

const svcOld = new Service({
  name: 'InfoboardService',
  script: path.join(projectRoot, 'server.js')
});
svcOld.uninstall();

const svc = new Service({
  name: 'Infoboard TV',
  script: path.join(projectRoot, 'server.js')
});

svc.on('uninstall', function() {
  console.log('================================================================');
  console.log('[SUCESSO] Servico "Infoboard TV Server" removido do Windows (services.msc)!');
  console.log('================================================================');
});

console.log('Desinstalando servico do Windows...');
svc.uninstall();
