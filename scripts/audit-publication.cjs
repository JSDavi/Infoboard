const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { sourceFiles, isLocalOnly } = require('./publication-files.cjs');

const root = path.resolve(__dirname, '..');

function localSecrets(directory) {
  const file = path.join(directory, '.env');
  if (!fs.existsSync(file)) return [];
  // dotenv e dependencia de runtime; nao carrega valores no process.env.
  const env = require('dotenv').parse(fs.readFileSync(file));
  return Object.entries(env).filter(([key, value]) =>
    /PASSWORD|TOKEN|SECRET|API_KEY|EMAIL|USERNAME|CHAT_ID/i.test(key) && value.length >= 6);
}

function inspect(relative, bytes, secrets = []) {
  const findings = [];
  for (const [key, value] of secrets) {
    if ([value, encodeURIComponent(value)].some(candidate => bytes.includes(Buffer.from(candidate)))) {
      findings.push({ file: relative, category: `valor configurado em ${key}` });
    }
  }
  const text = bytes.toString('utf8');
  const patterns = [
    ['chave privada', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['token GitHub', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
    ['chave AWS', /\bAKIA[0-9A-Z]{16}\b/],
    ['chave Google', /\bAIza[0-9A-Za-z_-]{35}\b/],
    ['token Telegram', /\b\d{8,12}:[A-Za-z0-9_-]{35}\b/]
  ];
  for (const [category, regex] of patterns) {
    if (regex.test(text)) findings.push({ file: relative, category });
  }
  return findings;
}

function auditTree(directory = root, secrets = localSecrets(directory)) {
  const files = sourceFiles(directory);
  const findings = files.flatMap(file => inspect(file, fs.readFileSync(path.join(directory, file)), secrets));
  return { scope: 'fontes publicaveis da pasta atual', filesScanned: files.length, findings };
}

function auditHistory(directory = root) {
  const git = args => execFileSync('git', args, { cwd: directory, maxBuffer: 200 * 1024 * 1024 });
  const secrets = localSecrets(directory);
  const objects = git(['rev-list', '--objects', '--all']).toString().trim().split('\n').filter(Boolean);
  const names = new Map(objects.map(row => {
    const split = row.indexOf(' ');
    return split < 0 ? [row, row] : [row.slice(0, split), row.slice(split + 1)];
  }));
  const checked = execFileSync('git', ['cat-file', '--batch-check=%(objectname) %(objecttype)'], {
    cwd: directory, input: [...names.keys()].join('\n') + '\n'
  }).toString().trim().split('\n');
  const ids = checked.filter(row => row.endsWith(' blob')).map(row => row.split(' ')[0]);
  const output = execFileSync('git', ['cat-file', '--batch'], {
    cwd: directory, input: ids.join('\n') + '\n', maxBuffer: 200 * 1024 * 1024
  });
  const findings = [];
  let offset = 0;
  for (const id of ids) {
    const end = output.indexOf(10, offset);
    const size = Number(output.subarray(offset, end).toString().split(' ')[2]);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('Resposta Git invalida');
    const bytes = output.subarray(end + 1, end + 1 + size);
    const file = names.get(id);
    findings.push(...inspect(file, bytes, secrets));
    if (isLocalOnly(file)) findings.push({ file, category: 'artefato local no historico' });
    offset = end + 1 + size + 1;
  }
  return { scope: 'blobs alcancaveis em todas as refs Git locais', blobsScanned: ids.length,
    findings: [...new Map(findings.map(f => [JSON.stringify(f), f])).values()] };
}

if (require.main === module) {
  try {
    const report = process.argv.includes('--history') ? auditHistory() : auditTree();
    console.log(JSON.stringify({ ...report, limitation:
      'Triagem de valores do .env local e padroes conhecidos; nao substitui revisao humana, nao descompacta binarios e nao detecta todo segredo possivel.' }, null, 2));
    process.exitCode = report.findings.length ? 1 : 0;
  } catch (error) {
    // Nao imprimir stdout/stderr de Git ou erros contendo conteudo de arquivos.
    console.error('Auditoria nao concluida. Confira disponibilidade do Git, dependencias e acesso aos arquivos.');
    process.exitCode = 2;
  }
}

module.exports = { inspect, auditTree, auditHistory };
