'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverFixture } = require('./helpers/server-fixture.cjs');
const {
  safeError, upstreamOptions, validatedUpstreamBaseUrl,
  sameOriginRedirect, isAllowedApiOrigin
} = require('../server-security');

test('safeError nao mostra credenciais, email, URL nem resposta externa', () => {
  const sensitive = 'sensitive@example.test?token=mock-value';
  const errors = [
    new Error(sensitive),
    { code: 'ETIMEDOUT', message: sensitive, config: { url: sensitive } },
    { response: { status: 403, data: sensitive }, message: sensitive },
    { response: { status: 999, data: sensitive }, code: sensitive }
  ];
  for (const error of errors) {
    const result = safeError(error);
    assert.doesNotMatch(result, /sensitive|token|example\.test|mock-value/i);
    assert.match(result, /^Falha de integra/);
  }
  assert.match(safeError(errors[1]), /ETIMEDOUT/);
  assert.match(safeError(errors[2]), /HTTP 403/);
  assert.equal(safeError(null), 'Falha de integração');
});

test('URLs autenticadas exigem HTTPS e nao aceitam userinfo, query ou hash', () => {
  assert.equal(validatedUpstreamBaseUrl('https://pbx.example.test/'), 'https://pbx.example.test');
  assert.equal(validatedUpstreamBaseUrl('https://api.example.test/subpath/'), 'https://api.example.test/subpath');
  const rejected = [
    'http://pbx.example.test',
    'https://user:password@pbx.example.test',
    'https://pbx.example.test?key=synthetic',
    'https://pbx.example.test/#fragment',
    'https://pbx.example.test/#',
    '//pbx.example.test',
    'https://pbx.example.test/ ',
    'file:///tmp/data',
    'invalid'
  ];
  for (const item of rejected) {
    assert.throws(() => validatedUpstreamBaseUrl(item), error => {
      assert.doesNotMatch(error.message, /password|synthetic|pbx\.example/i);
      return true;
    });
  }
});

test('redirecionamento de sessao so segue a mesma origem', () => {
  const source = 'https://npx.example.test/users/sign_in';
  assert.equal(sameOriginRedirect('/dashboard', source), 'https://npx.example.test/dashboard');
  assert.equal(sameOriginRedirect('https://npx.example.test:443/dashboard', source), 'https://npx.example.test/dashboard');
  for (const location of [
    'https://other.example.test/dashboard',
    '//other.example.test/dashboard',
    'http://npx.example.test/dashboard',
    'https://user:password@npx.example.test/dashboard',
    'javascript:alert(1)',
    ''
  ]) {
    assert.throws(() => sameOriginRedirect(location, source));
  }
});

test('todas as opcoes de integracao limitam tempo e proíbem redirects automaticos', () => {
  const options = upstreamOptions({ headers: { Authorization: 'Bearer MOCK' }, maxRedirects: 9 });
  assert.equal(options.timeout, 12000);
  assert.equal(options.maxRedirects, 0);
  assert.equal(options.headers.Authorization, 'Bearer MOCK');
  assert.equal(upstreamOptions({}, 20000).timeout, 20000);
});

test('Host e Origin bloqueiam DNS rebinding e preservam LAN autorizada', () => {
  const req = headers => ({ headers });
  const cfg = { hostname: 'infoboard-host', allowedHosts: 'wallboard.intra,alias.intra:3001' };
  for (const host of ['localhost:3001', '127.0.0.1:3001', '192.168.1.15:3001', 'infoboard-host:3001', 'wallboard.intra', 'alias.intra:3001']) {
    assert.equal(isAllowedApiOrigin(req({ host }), cfg), true, `host permitido: ${host}`);
  }
  assert.equal(isAllowedApiOrigin(req({ host: 'localhost:3001', origin: 'http://localhost:3001' }), cfg), true);
  assert.equal(isAllowedApiOrigin(req({ host: 'localhost:3001', origin: 'https://evil.example.test' }), cfg), false);
  assert.equal(isAllowedApiOrigin(req({ host: 'attacker.example.test' }), cfg), false);
  assert.equal(isAllowedApiOrigin(req({ host: 'alias.intra:4000' }), cfg), false);
  assert.equal(isAllowedApiOrigin(req({ host: 'localhost:3001', origin: 'null' }), cfg), false);
  assert.equal(isAllowedApiOrigin(req({ host: 'user@localhost:3001' }), cfg), false);
  assert.equal(isAllowedApiOrigin(req({ host: 'localhost:3001/path' }), cfg), false);
});

test('coleta PBX real configura transporte TLS seguro, timeout e bloqueio de redirect', async t => {
  const requests = [];
  const fixture = await serverFixture({
    env: { PBX_BASE_URL: 'https://pbx.example.test', PBX_API_TOKEN: 'fixture-token', PBX_API_KEY: 'fixture-key' },
    axios: { get: async (url, options) => {
      requests.push({ url, options });
      return { data: { error: 0, data: [] } };
    } }
  });
  t.after(fixture.close);
  await new Promise(setImmediate);
  assert.equal(requests.length, 3);
  for (const { url, options } of requests) {
    assert.equal(new URL(url).origin, 'https://pbx.example.test');
    assert.equal(options.httpsAgent.options.rejectUnauthorized, true);
    assert.equal(options.timeout, 12000);
    assert.equal(options.maxRedirects, 0);
  }
});
