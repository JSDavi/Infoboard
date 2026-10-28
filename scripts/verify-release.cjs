const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { sourceFiles, isLocalOnly } = require('./publication-files.cjs');
const { auditTree } = require('./audit-publication.cjs');

const root = path.resolve(__dirname, '..');
const issues = [];
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const installer = fs.readFileSync(path.join(root, 'instalador/INSTALAR_INFOBOARD.bat'), 'utf8');

if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) issues.push('Versao SemVer invalida no package.json.');
if (pkg.version !== lock.version || pkg.version !== lock.packages?.['']?.version) {
  issues.push('Versoes de package.json e package-lock.json divergentes.');
}
if (!installer.includes(`Versao: ${pkg.version} ^| Pacote local de distribuicao`)) {
  issues.push('Versao exibida pelo instalador divergente.');
}
if (!fs.readFileSync(path.join(root, 'public/index.html'), 'utf8').includes(`>Versão ${pkg.version}</span>`)) {
  issues.push('Versao inicial mostrada no painel divergente.');
}
if (!fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes(`**Versao de publicacao: ${pkg.version}**`)) {
  issues.push('Versao de publicacao no README divergente.');
}
if (!fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').includes(`## ${pkg.version}`)) {
  issues.push('CHANGELOG.md nao documenta esta versao.');
}

const published = sourceFiles(root);
let tracked;
try {
  tracked = execFileSync('git', ['ls-files', '-z', '--cached'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean).map(file => file.replaceAll('\\', '/'));
} catch {
  issues.push('Nao foi possivel consultar o indice Git.');
}
if (tracked) {
  const selected = new Set(published);
  const indexed = new Set(tracked);
  for (const file of tracked) {
    if (isLocalOnly(file) || !fs.existsSync(path.join(root, file))) {
      issues.push(`Arquivo local, removido ou privado no indice Git: ${file}`);
    } else if (!selected.has(file)) {
      issues.push(`Arquivo fora da distribuicao no indice Git: ${file}`);
    }
  }
  for (const file of published) {
    if (!indexed.has(file)) issues.push(`Fonte publicavel ainda fora do indice Git: ${file}`);
  }
}

const audit = auditTree(root);
for (const finding of audit.findings) issues.push(`Triagem de publicacao: ${finding.file} (${finding.category})`);

if (issues.length) {
  console.error('Pre-publicacao reprovada:\n' + issues.map(issue => `- ${issue}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Pre-publicacao aprovada: v${pkg.version}; ${tracked.length} arquivos versionados; ${audit.filesScanned} arquivos auditados.`);
}
