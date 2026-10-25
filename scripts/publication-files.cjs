const fs = require('node:fs');
const path = require('node:path');

// Uma distribuicao de fontes nao inclui estado de maquinas, agentes ou usuarios.
function isLocalOnly(relative) {
  const normalized = relative.replaceAll('\\', '/');
  const parts = normalized.split('/');
  const name = parts.at(-1);
  return (parts[0] === 'docs' && ['auditoria', 're'].includes(parts[1])) ||
    ['agent-skills', '--prefix'].includes(parts[0]) ||
    normalized === 'AGENTS.md' || /^MAESTRI-[^/]+\.md$/i.test(normalized) ||
    ['scripts/alinha-perfis-skills-maestri.mjs', 'scripts/configure-global-agent-defaults.ps1',
      'scripts/instalar-skills-davi.mjs', 'scripts/instalar-skills-india.mjs',
      'scripts/repair-codex-launchers.ps1'].includes(normalized) ||
    parts.some(part => /^\.git(?:$|[-_.])/i.test(part) || /\.git$/i.test(part)) ||
    parts.some(part => ['.git', 'node_modules', '.maestri', '.agents', 'backups',
    'daemon', 'artifacts', 'dist', 'coverage', 'chrome-preview-profile', 'raw'].includes(part)) ||
    (name.startsWith('.env') && relative !== '.env.example') ||
    /\.(?:log|zip|tgz|tap|bak|tmp|orig|pem|key|env)$/i.test(name) ||
    ['config/analysts_map.json', 'temp.json', 'html_dump.html', 'check_url.txt', 'query',
      'test_nossatelecom_real.js', 'test_login_wrong.js', 'test_rules.js',
      'instalador/GUIA_OPERACAO.md', 'instalador/REINICIAR_PRODUCAO.bat',
      'REINICIAR_PRODUCAO.bat'].includes(normalized) ||
    /^test_queues[^/]*\.js$/i.test(normalized);
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
