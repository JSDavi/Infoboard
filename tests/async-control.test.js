const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startSerialPolling } = require('../async-control');

const root = path.resolve(__dirname, '..');

test('startSerialPolling agenda o proximo ciclo somente apos o atual terminar', async () => {
  const timers = [];
  let resolveTask;
  let calls = 0;
  const setTimer = (callback, delay) => {
    const timer = { callback, delay, cleared: false };
    timers.push(timer);
    return timer;
  };

  const poller = startSerialPolling(async () => {
    calls++;
    await new Promise(resolve => { resolveTask = resolve; });
  }, { intervalMs: 5000, initialDelayMs: 1000, setTimer, clearTimer: timer => { timer.cleared = true; } });

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 1000);
  const firstTick = timers[0].callback();
  assert.equal(calls, 1);
  assert.equal(poller.isRunning(), true);
  assert.equal(timers.length, 1);

  resolveTask();
  await firstTick;
  assert.equal(poller.isRunning(), false);
  assert.equal(timers.length, 2);
  assert.equal(timers[1].delay, 5000);

  poller.stop();
  assert.equal(timers[1].cleared, true);
});

test('servidor e instaladores usam ciclo serial e intervalo seguro', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  const installer = fs.readFileSync(path.join(root, 'instalador', 'INSTALAR_INFOBOARD.bat'), 'utf8');
  const template = fs.readFileSync(path.join(root, 'instalador', 'templates', 'INSTALAR_INFOBOARD.bat.in'), 'utf8');

  assert.match(server, /startSerialPolling\(runUpdateCycle/);
  assert.doesNotMatch(server, /setInterval\(runUpdateCycle/);
  for (const source of [envExample, installer, template]) {
    assert.match(source, /UPDATE_INTERVAL_SECONDS=10/);
  }
});
