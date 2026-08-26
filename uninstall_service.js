const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'InfoboardService',
  script: path.join(__dirname, 'server.js')
});

svc.on('uninstall', function() {
  console.log('================================================================');
  console.log('[SUCESSO] Servico "Infoboard TV Server" removido do Windows (services.msc)!');
  console.log('================================================================');
});

console.log('Desinstalando servico do Windows...');
svc.uninstall();
