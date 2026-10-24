const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('imagens da fonte de horários aceitam somente hosts internos aprovados', () => {
  const start = serverSource.indexOf('const TRUSTED_HORARIOS_IMAGE_HOSTS');
  const end = serverSource.indexOf('function isWorkingHours()', start);
  assert.ok(start >= 0 && end > start, 'helpers de imagem do backend devem existir');

  const context = vm.createContext({ URL, Set });
  vm.runInContext(serverSource.slice(start, end), context);

  assert.equal(
    context.normalizeTrustedHorariosImageSrc('/static/fotos/pessoa.jpg'),
    'http://192.168.243.2:8888/static/fotos/pessoa.jpg'
  );
  assert.equal(
    context.normalizeTrustedHorariosImageSrc('http://srv-ads002:8888/fotos/pessoa.jpg'),
    'http://srv-ads002:8888/fotos/pessoa.jpg'
  );
  assert.equal(context.normalizeTrustedHorariosImageSrc('https://example.com/pessoa.jpg'), '');
  assert.equal(context.normalizeTrustedHorariosImageSrc('javascript:alert(1)'), '');
  assert.equal(context.normalizeTrustedHorariosImageSrc('http://usuario:senha@192.168.243.2:8888/foto.jpg'), '');
});

test('escala dominical publicada não conserva cargo ou foto desnecessários', () => {
  const start = serverSource.indexOf('const sobreavisoDomingosArr = []');
  const end = serverSource.indexOf('sobreavisoDomingosArr.sort', start);
  const parserSource = serverSource.slice(start, end);

  assert.ok(start >= 0 && end > start, 'parser da escala dominical deve existir');
  assert.doesNotMatch(parserSource, /\bcargo\b/);
  assert.doesNotMatch(parserSource, /\bfoto\b/);
  assert.match(parserSource, /nome[\s\S]*data:[\s\S]*dataIso[\s\S]*proximo/);
});

test('frontend rejeita imagem externa e usa fallback sem rede', () => {
  const start = appSource.indexOf('const EVENT_AVATAR_FALLBACK');
  const end = appSource.indexOf('function checkEventOverlay(', start);
  assert.ok(start >= 0 && end > start, 'helpers seguros do overlay devem existir');

  const context = vm.createContext({ URL, Set });
  vm.runInContext(appSource.slice(start, end), context);

  assert.equal(
    context.safeEventImageSrc('http://192.168.243.2:8888/fotos/pessoa.jpg'),
    'http://192.168.243.2:8888/fotos/pessoa.jpg'
  );
  assert.match(context.safeEventImageSrc('https://evil.example/foto.jpg'), /^data:image\/svg\+xml,/);
  assert.match(context.safeEventImageSrc('javascript:alert(1)'), /^data:image\/svg\+xml,/);
});

test('overlay de eventos renderiza dados remotos como texto e sem fallback externo', () => {
  const start = appSource.indexOf('function showEventOverlay(');
  const end = appSource.indexOf('// --- BOTAO DISCRETO PARA PAUSAR EVENTOS ---', start);
  const overlaySource = appSource.slice(start, end);

  assert.ok(start >= 0 && end > start, 'renderizador do overlay deve existir');
  assert.doesNotMatch(overlaySource, /ui-avatars\.com/i);
  assert.doesNotMatch(overlaySource, /grid\.innerHTML\s*\+=/);
  assert.doesNotMatch(overlaySource, /\.innerHTML\s*=\s*evento\./);
  assert.doesNotMatch(overlaySource, /\.innerHTML\s*=\s*title\b/);
  assert.match(overlaySource, /partyTitle\.textContent\s*=\s*title/);
  assert.match(overlaySource, /obsDiv\.textContent\s*=\s*evento\.obs/);
  assert.match(overlaySource, /appendChild\(createEventParticipantNode\(p, index, (?:true|false)\)\)/);
});

test('preferência de movimento reduzido também desativa o marquee contínuo', () => {
  const start = cssSource.indexOf('@media (prefers-reduced-motion: reduce)');
  const end = cssSource.indexOf('#voice-half .sefaz-global-badge', start);
  const reducedMotionCss = cssSource.slice(start, end);

  assert.match(reducedMotionCss, /\.ticker-text\s*\{[\s\S]*?animation:\s*none;[\s\S]*?transform:\s*none;/);
});
