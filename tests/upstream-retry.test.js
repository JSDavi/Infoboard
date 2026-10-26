const test = require('node:test');
const assert = require('node:assert/strict');
const { serverFixture } = require('./helpers/server-fixture.cjs');

test('sessao NPX invalida interrompe apos uma reautenticacao', async t => {
  let requests = 0;
  const fixture = await serverFixture({ axios: { get: async () => {
    if (++requests > 2) throw new Error('Test guard: requests exceeded');
    return { data: '<form id="new_user">fixture</form>' };
  } } });
  t.after(fixture.close);
  fixture.evaluate(`
    this.fixtureAuthCalls = 0;
    connectionStatus.authenticated = true;
    activeSession.cookies = { fixture: 'cookie' };
    authenticate = async () => {
      fixtureAuthCalls++;
      connectionStatus.authenticated = true;
      activeSession.cookies = { fixture: 'cookie' };
    };
  `);
  await assert.rejects(fixture.evaluate('apiGet("/fixture")'));
  assert.equal(requests, 2);
  assert.equal(fixture.evaluate('fixtureAuthCalls'), 1);
  assert.equal(fixture.evaluate('connectionStatus.authenticated'), false);
});

test('falha transitória repete uma vez sem descartar a sessão NPX válida', async t => {
  let requests = 0;
  const fixture = await serverFixture({ axios: { get: async () => {
    requests++;
    if (requests === 1) {
      const error = new Error('fixture network');
      error.code = 'ECONNRESET';
      throw error;
    }
    return { data: { ok: true } };
  } } });
  t.after(fixture.close);
  fixture.evaluate(`
    connectionStatus.authenticated = true;
    activeSession.cookies = { fixture: 'cookie' };
    waitForNpxRetry = async () => {};
  `);

  const result = await fixture.evaluate('apiGet("/fixture")');
  assert.equal(requests, 2);
  assert.equal(result.ok, true);
  assert.equal(fixture.evaluate('activeSession.hasCookies()'), true);
  assert.equal(fixture.evaluate('connectionStatus.authenticated'), true);
});
