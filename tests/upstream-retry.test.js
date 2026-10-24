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
