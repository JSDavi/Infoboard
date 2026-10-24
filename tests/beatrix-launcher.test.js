const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const base = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
const launcher = fs.readFileSync(path.join(base, 'beatrix-launcher.js'), 'utf8');
const officialUrl = 'https://agente.npx.app.br/agent_users/sign_in';

test('atalho aponta para o Beatrix oficial e não reproduz o formulário no InfoBoard', () => {
  assert.match(html, /id="beatrix-login-btn"[^>]+href="https:\/\/agente\.npx\.app\.br\/agent_users\/sign_in"/s);
  assert.match(html, /id="beatrix-login-btn"[^>]+rel="noopener noreferrer"/s);
  assert.match(html, /src="beatrix-launcher\.js/);
  assert.doesNotMatch(html, /<iframe|<input\b[^>]*type="password"/i);
  assert.doesNotMatch(launcher, /\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage)\b/);
  assert.match(html, /class="beatrix-login-label">Login<\/span>/);
});

function clickLauncher(openResult) {
  let handle;
  let opened;
  let prevented = false;
  const link = {
    href: officialUrl,
    addEventListener(type, callback) {
      assert.equal(type, 'click');
      handle = callback;
    }
  };
  const sandbox = {
    document: { getElementById: id => id === 'beatrix-login-btn' ? link : null },
    window: {
      screen: { availWidth: 1366, availHeight: 768 },
      open(url, name, features) { opened = { url, name, features }; return openResult; }
    }
  };
  vm.runInNewContext(launcher, sandbox);
  handle({ preventDefault: () => { prevented = true; } });
  return { opened, prevented };
}

test('clique abre as duas etapas no mesmo domínio oficial e janela redimensionável', () => {
  const popup = { opener: {}, focused: false, focus() { this.focused = true; } };
  const result = clickLauncher(popup);
  assert.equal(result.opened.url, officialUrl);
  assert.equal(result.opened.name, 'infoboard-beatrix-oficial');
  assert.match(result.opened.features, /popup=yes,width=520,height=736/);
  assert.match(result.opened.features, /toolbar=no,menubar=no,location=no,status=no/);
  assert.match(result.opened.features, /resizable=yes,scrollbars=yes/);
  assert.equal(result.prevented, true);
  assert.equal(popup.opener, null);
  assert.equal(popup.focused, true);
});

test('bloqueio de popup preserva navegação segura pelo link HTML', () => {
  const result = clickLauncher(null);
  assert.equal(result.opened.url, officialUrl);
  assert.equal(result.prevented, false);
});
