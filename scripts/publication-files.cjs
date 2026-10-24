const fs = require('node:fs');
const path = require('node:path');

// Uma distribuicao de fontes nao inclui estado de maquinas, agentes ou usuarios.
function isLocalOnly(relative) {
  const parts = relative.replaceAll('\\', '/').split('/');
  const name = parts.at(-1);
  return (parts[0] === 'docs' && parts[1] === 'auditoria') ||
    parts.some(part => ['.git', 'node_modules', '.maestri', '.agents', 'backups',
    'daemon', 'artifacts', 'dist', 'coverage', 'chrome-preview-profile', 'raw'].includes(part)) ||
    (name.startsWith('.env') && relative !== '.env.example') ||
    /\.(?:log|zip|tgz|tap|bak|tmp|orig|pem|key)$/i.test(name) ||
    ['config/analysts_map.json', 'temp.json', 'html_dump.html', 'check_url.txt', 'query',
      'test_nossatelecom_real.js'].includes(relative.replaceAll('\\', '/'));
}

function sourceFiles(root) {
  const files = [];
  function walk(relative = '') {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const next = relative ? `${relative}/${entry.name}` : entry.name;
      if (isLocalOnly(next)) continue;
      if (entry.isSymbolicLink()) throw new Error(`Link exige revisao manual: ${next}`);
      if (entry.isDirectory()) walk(next);
      else if (entry.isFile()) files.push(next);
    }
  }
  walk();
  return files.sort();
}

module.exports = { isLocalOnly, sourceFiles };
