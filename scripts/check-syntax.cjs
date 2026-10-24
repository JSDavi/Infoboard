const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { sourceFiles } = require('./publication-files.cjs');
const root = path.resolve(__dirname, '..');
const files = sourceFiles(root).filter(file => /\.(?:js|cjs|mjs)$/.test(file));
let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (result.status !== 0) {
    // A linha da falha pode conter dados restritos; o caminho basta para investigar.
    console.error(`Sintaxe invalida: ${file}`);
    failures++;
  }
}
console.log(`${files.length} arquivos verificados; ${failures} falhas de sintaxe.`);
process.exitCode = failures ? 1 : 0;
