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

  assert.equal(snapshots.length, 5);
  assert.equal(calls.length, 15);
  assert.deepEqual(calls.slice(0, 5).map(call => call.endpoint),
    Array(5).fill('/rates/totals_filter_by_queues.json'));
  assert.deepEqual(calls.slice(5, 10).map(call => call.endpoint),
    Array(5).fill('/rates/details_by_queue.json'));
  assert.deepEqual(calls.slice(10, 15).map(call => call.endpoint),
    Array(5).fill('/rates/wait_calls.json'));
  for (const groupStart of [0, 5, 10]) {
    assert.deepEqual(calls.slice(groupStart, groupStart + 5).map(call => call.queue), queues);
  }
});
