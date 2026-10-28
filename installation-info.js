const fs = require('node:fs');
const path = require('node:path');

const METADATA_NAME = '.infoboard-installation.json';

// Um registro de outra versão (ex.: cópia manual de arquivos) não informa
// corretamente a data da versão em execução.
function readInstallationInfo(root = __dirname) {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  let installedAt = null;
  try {
    const info = JSON.parse(fs.readFileSync(path.join(root, METADATA_NAME), 'utf8'));
    if (info.version === version &&
      typeof info.installedAt === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(info.installedAt) &&
      Number.isFinite(Date.parse(info.installedAt))) installedAt = info.installedAt;
  } catch {
    // Instalações anteriores à introdução deste registro não têm data conhecida.
  }
  return { version, installedAt };
}

module.exports = { METADATA_NAME, readInstallationInfo };
