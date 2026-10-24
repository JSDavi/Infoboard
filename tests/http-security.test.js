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
