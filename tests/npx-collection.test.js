const test = require('node:test');
const assert = require('node:assert/strict');
const { serverFixture } = require('./helpers/server-fixture.cjs');

test('coleta as cinco filas juntas em tres etapas sem rajada de quinze chamadas', async t => {
  const fixture = await serverFixture();
  t.after(fixture.close);
  fixture.evaluate(`
    this.fixtureCalls = [];
    apiGet = async (endpoint, params) => {
      fixtureCalls.push({ endpoint, queue: params.queue });
      if (endpoint.includes('totals')) return { total_wait: 0, wait: '00:00' };
      if (endpoint.includes('details')) return { details: [] };
      return { wait_calls: [] };
    };
  `);

  const snapshots = JSON.parse(await fixture.evaluate(
    'collectNpxQueueSnapshots(Object.entries(DEPARTMENTS)).then(JSON.stringify)'
  ));
  const calls = JSON.parse(fixture.evaluate('JSON.stringify(fixtureCalls)'));
  const queues = Object.keys(fixture.evaluate('DEPARTMENTS'));

  assert.equal(snapshots.queues.length, 5);
  assert.equal(snapshots.auxiliaryFailures, 0);
  assert.equal(calls.length, 15);
  assert.deepEqual(calls.slice(0, 5).map(call => call.endpoint),
    Array(5).fill('/rates/totals_filter_by_queues.json'));
  assert.deepEqual(calls.slice(5, 10).map(call => call.endpoint),
    Array(5).fill('/rates/wait_calls.json'));
  assert.deepEqual(calls.slice(10, 15).map(call => call.endpoint),
    Array(5).fill('/rates/details_by_queue.json'));
  for (const groupStart of [0, 5, 10]) {
    assert.deepEqual(calls.slice(groupStart, groupStart + 5).map(call => call.queue), queues);
  }
});

test('falhas nas consultas auxiliares não invalidam os detalhes dos analistas', async t => {
  const fixture = await serverFixture();
  t.after(fixture.close);
  fixture.evaluate(`
    apiGet = async (endpoint, params) => {
      if (endpoint.includes('details')) return { details: [{ name: 'Analista QA', status: 1, paused: 0 }] };
      if (endpoint.includes('totals') && params.queue === Object.values(DEPARTMENTS)[0].path)
        throw new Error('Totais indisponíveis');
      if (endpoint.includes('wait_calls')) throw new Error('Aguardando indisponível');
      if (endpoint.includes('totals')) return { total_wait: 2, wait: '00:20' };
      return { wait_calls: [] };
    };
  `);

  const snapshots = JSON.parse(await fixture.evaluate(
    'collectNpxQueueSnapshots(Object.entries(DEPARTMENTS)).then(JSON.stringify)'
  ));
  assert.equal(snapshots.queues.length, 5);
  assert.equal(snapshots.auxiliaryFailures, 6);
  assert.equal(snapshots.queues[0].totals, null);
  assert.equal(snapshots.queues[0].waitCalls, null);
  assert.equal(snapshots.queues[0].details.details[0].name, 'Analista QA');
  assert.equal(snapshots.queues[1].totals.total_wait, 2);
});

test('falha nos detalhes obrigatórios impede publicar estados não confirmados', async t => {
  const fixture = await serverFixture();
  t.after(fixture.close);
  fixture.evaluate(`
    apiGet = async endpoint => {
      if (endpoint.includes('details')) throw new Error('Detalhes NPX indisponíveis');
      return {};
    };
  `);
  await assert.rejects(
    fixture.evaluate('collectNpxQueueSnapshots(Object.entries(DEPARTMENTS))'),
    /Detalhes NPX indisponíveis/
  );
});
