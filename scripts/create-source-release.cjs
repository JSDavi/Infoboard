const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { sourceFiles } = require('./publication-files.cjs');
const { auditTree } = require('./audit-publication.cjs');

const root = path.resolve(__dirname, '..');

try {
  const report = auditTree(root);
  if (report.findings.length) throw new Error('A triagem de publicacao encontrou itens pendentes.');
  const output = process.argv[2] && path.resolve(process.argv[2]);
  // Resolver tambem junctions/symlinks do pai antes de criar qualquer destino.
  let parent = output;
  const missing = [];
  while (parent && !fs.existsSync(parent)) {
    missing.unshift(path.basename(parent));
    const next = path.dirname(parent);
    if (next === parent) throw new Error('Destino sem ancestral acessivel.');
    parent = next;
  }
  const physicalOutput = parent && path.resolve(fs.realpathSync(parent), ...missing);
  const relative = physicalOutput && path.relative(fs.realpathSync(root), physicalOutput);
  if (!output || relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..')) {
    throw new Error('Informe uma pasta de destino nova FORA do projeto.');
  }
  if (fs.existsSync(output)) throw new Error('Destino ja existe; nenhum arquivo foi sobrescrito.');
  fs.mkdirSync(output, { recursive: true });
  const source = path.join(output, 'InfoBoard');
  const manifest = [];
  for (const file of sourceFiles(root)) {
    const data = fs.readFileSync(path.join(root, file));
    const target = path.join(source, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');
    if (sha256 !== crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')) {
      throw new Error('Falha ao conferir copia.');
    }
    manifest.push({ path: file, bytes: data.length, sha256 });
  }
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  execFileSync('tar', ['-a', '-cf', path.join(output, 'InfoBoard-source.zip'), '-C', output, 'InfoBoard']);
  const archive = fs.readFileSync(path.join(output, 'InfoBoard-source.zip'));
  fs.writeFileSync(path.join(output, 'SHA256SUMS.txt'),
    `${crypto.createHash('sha256').update(archive).digest('hex')}  InfoBoard-source.zip\n`);
  console.log(JSON.stringify({ output, files: manifest.length,
    sourceBytes: manifest.reduce((sum, item) => sum + item.bytes, 0), zipBytes: archive.length,
    historyIncluded: false, localConfigIncluded: false }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
