const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const cssSource = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('almoço aparece como 2h e mantém limite funcional de duas horas', () => {
  assert.match(appSource, /id:\s*["']Almoço["'][\s\S]*?time:\s*["']2h["']/);

  const start = appSource.indexOf('function getPauseLimitSeconds(');
  const end = appSource.indexOf('// Helper para definir a cor', start);
  assert.ok(start >= 0 && end > start, 'função de limite das pausas deve existir');

  const context = vm.createContext({ Infinity });
  vm.runInContext(appSource.slice(start, end), context);
  assert.equal(context.getPauseLimitSeconds('Almoço'), 2 * 60 * 60);
  assert.equal(context.getPauseLimitSeconds('Almoco'), 2 * 60 * 60);
});

test('remove TMR, contagem regressiva e metadados visuais de fonte/coleta', () => {
  assert.doesNotMatch(htmlSource, /chat-kpi-tmr|TMR:\s*S\/D/i);
  assert.doesNotMatch(htmlSource, /countdown-label|Próxima atualização/i);
  assert.doesNotMatch(appSource, /startCountdownTimer|countdownValue|countdownInterval/);

  const renderStart = appSource.indexOf('function renderSefazWidget(');
  const renderEnd = appSource.indexOf("window.addEventListener('resize'", renderStart);
  const renderSource = appSource.slice(renderStart, renderEnd);
  assert.doesNotMatch(renderSource, /radar-source-time|sefaz-radar-time|checkedTime|\bsource\b/);
  assert.doesNotMatch(htmlSource, /sefaz-radar-time|radar-source-time|Fontes oficiais/i);
});

test('SEFAZ usa opção 1 minimalista: 4 cards em linha, ponto colorido, rótulo e sem gráfico cardíaco', () => {
  // Remoção integral de gráfico cardíaco, sparkline e animações associadas
  assert.doesNotMatch(appSource, /pulsePath|sefaz-pulse/);
  assert.doesNotMatch(htmlSource, /sefaz-pulse/);
  assert.doesNotMatch(cssSource, /sefaz-pulse|sefaz-pulse-trace/);

  // Semântica dos 4 documentos em linha e estrutura minimalista
  const docs = ['nfe', 'nfce', 'cte', 'mdfe'];
  docs.forEach(doc => {
    assert.match(htmlSource, new RegExp(`data-sefaz-document="${doc}"`));
  });

  // Estrutura: texto à esquerda e ponto + rótulo à direita
  assert.match(htmlSource, /class="sefaz-status-dot"/);
  assert.match(htmlSource, /class="radar-row-status"/);
  assert.match(appSource, /class="sefaz-status-dot"/);
  assert.match(appSource, /class="radar-row-status"/);

  // Estados e rótulos conformes: NORMAL, INSTÁVEL, INDISPONÍVEL, sem falso NORMAL
  assert.match(appSource, /NORMAL/);
  assert.match(appSource, /INSTÁVEL/);
  assert.match(appSource, /INDISPONÍVEL/);
  assert.match(appSource, /DESATUALIZADO/);

  // Estilos CSS: cores suaves, ponto e alinhamento
  assert.match(cssSource, /\.sefaz-status-dot/);
  assert.match(cssSource, /status-ok[^{]*\{[^}]*#ecfdf5/);
  assert.match(cssSource, /status-warning[^{]*\{[^}]*#fffbeb/);
  assert.match(cssSource, /status-danger[^{]*\{[^}]*#fef2f2/);
  assert.match(cssSource, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
});

test('painel mantém somente indicadores visuais de pausa e nenhuma operação do analista', () => {
  assert.doesNotMatch(htmlSource, /id="(?:npx-pause-modal|npx-auth-modal|npx-login-btn)"/);
  assert.doesNotMatch(appSource, /\b(?:sendNpxAction|saveNpxAuth|openPauseModal|quickLoginQueue)\b/);
  assert.doesNotMatch(cssSource, /\.pause-option-btn\s*\{|#npx-pause-modal/);
  assert.match(appSource, /function buildPausePillHtml\(/);
  assert.match(appSource, /function resolveAgentRealPauseState\(/);
});
