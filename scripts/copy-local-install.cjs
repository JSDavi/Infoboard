const fs = require('node:fs');
const path = require('node:path');
const { sourceFiles } = require('./publication-files.cjs');

function copyLocalInstallation(source, destination) {
  const root = fs.realpathSync(path.resolve(source));
  const target = path.resolve(destination);
  const targetRoot = fs.existsSync(target) ? fs.realpathSync(target) : target;
  const nested = (child, parent) => child.toLowerCase().startsWith(`${parent.toLowerCase()}${path.sep}`);
  if (root.toLowerCase() === targetRoot.toLowerCase() || nested(root, targetRoot) || nested(targetRoot, root)) {
    throw new Error('A origem e a instalacao devem ser pastas separadas.');
  }
  if (!fs.existsSync(path.join(root, 'server.js'))) {
    throw new Error('Origem nao contem server.js.');
  }
  const files = sourceFiles(root);
  // A mesma selecao de arquivos usada na auditoria e no pacote de publicacao.
  // Nao apaga arquivos do destino e nunca substitui .env ou mapa de analistas.
  for (const relative of files) {
    const output = path.join(target, relative);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.copyFileSync(path.join(root, relative), output);
  }
  return files.length;
}

if (require.main === module) {
  try {
    if (process.argv.length !== 4) throw new Error('Informe origem e destino absolutos.');
    if (![process.argv[2], process.argv[3]].every(path.isAbsolute)) {
      throw new Error('Origem e destino devem ser absolutos.');
    }
    const copied = copyLocalInstallation(process.argv[2], process.argv[3]);
    console.log(`[OK] ${copied} arquivos de distribuicao copiados.`);
  } catch (error) {
    console.error(`[FALHA] Copia local: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { copyLocalInstallation };
