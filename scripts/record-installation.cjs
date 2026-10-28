const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { readInstallationInfo, METADATA_NAME } = require('../installation-info');

// Executado somente depois de concluir a instalacao. Cada instalacao bem-
// sucedida registra a data desta aplicacao, inclusive reinstalacoes.
function recordInstallation(root = path.resolve(__dirname, '..'), now = new Date()) {
  const target = path.join(root, METADATA_NAME);
  const current = readInstallationInfo(root);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.name !== 'infoboard' || !/^\d+\.\d+\.\d+$/.test(current.version)) {
    throw new Error('Pacote InfoBoard invalido.');
  }
  const installedAt = now.toISOString();
  const temporary = path.join(root, `${METADATA_NAME}-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, JSON.stringify({ version: current.version, installedAt }) + '\n', {
      encoding: 'utf8', flag: 'wx', mode: 0o600
    });
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return { version: current.version, installedAt };
}

if (require.main === module) {
  try {
    const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
    const result = recordInstallation(root);
    console.log(`Versao ${result.version}: data de instalacao registrada.`);
  } catch (error) {
    console.error('Falha ao registrar versao/data da instalacao:', error.code || error.message);
    process.exitCode = 1;
  }
}

module.exports = { recordInstallation };
