const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { serverFixture } = require('./helpers/server-fixture.cjs');

function request(base, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(base + pathname, { headers }, res => {
      const parts = [];
      res.on('data', part => parts.push(part));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts).toString() }));
    });
    req.on('error', reject);
  });
}

test('servidor permite leitura local e bloqueia origem falsa sem acessar integracoes reais', async t => {
  const fixture = await serverFixture();
  t.after(fixture.close);
  const data = await request(fixture.url, '/api/data');
  assert.equal(data.status, 200);
  assert.match(data.headers['cache-control'], /no-store/);
  assert.ok(JSON.parse(data.body).departments);
  assert.doesNotMatch(data.body, /\b(password|cookie|api_token|api_key)\b/i);

  const hostile = await request(fixture.url, '/api/data', { Origin: 'https://attacker.invalid' });
  assert.equal(hostile.status, 403);
  const rebound = await request(fixture.url, '/api/data', { Host: 'attacker.invalid' });
  assert.equal(rebound.status, 403);
  const forwarded = await request(fixture.url, '/api/data', { 'X-Forwarded-For': '127.0.0.1' });
  assert.ok([401, 403].includes(forwarded.status));

  for (const file of ['/.env', '/config/analysts_map.json', '/server.js']) {
    assert.equal((await request(fixture.url, file)).status, 404);
  }
});

test('API exige IP autorizado mesmo na LAN e nao aceita cookie como liberacao', async t => {
  const fixture = await serverFixture({ remoteAddress: '192.168.20.15',
    env: { INFOBOARD_ALLOW_PRIVATE_NETWORK: 'false' } });
  t.after(fixture.close);
  const response = await request(fixture.url, '/api/data', { Cookie: 'npx_session=fixture' });
  assert.equal(response.status, 401);
  assert.match(response.headers['cache-control'], /no-store/);
  assert.equal(JSON.parse(response.body).departments, undefined);
});

test('API libera apenas a estacao configurada e respeita a opcao de compatibilidade', async t => {
  for (const env of [
    { INFOBOARD_VIEWER_ALLOWED_IPS: '192.168.20.15', INFOBOARD_ALLOW_PRIVATE_NETWORK: 'false' },
    { INFOBOARD_ALLOW_PRIVATE_NETWORK: 'true' },
    {}
  ]) {
    const fixture = await serverFixture({ remoteAddress: '192.168.20.15', env });
    t.after(fixture.close);
    assert.equal((await request(fixture.url, '/api/data')).status, 200);
    const forwarded = await request(fixture.url, '/api/data', { 'X-Real-IP': '' });
    assert.equal(forwarded.status, 401);
  }
  const fixture = await serverFixture({ remoteAddress: '192.168.20.16',
    env: { INFOBOARD_VIEWER_ALLOWED_IPS: '192.168.20.15', INFOBOARD_ALLOW_PRIVATE_NETWORK: 'false' } });
  t.after(fixture.close);
  assert.equal((await request(fixture.url, '/api/data')).status, 401);
});
