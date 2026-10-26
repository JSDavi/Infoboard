'use strict';

function startSerialPolling(task, options = {}) {
  if (typeof task !== 'function') throw new TypeError('task deve ser uma funcao');

  const intervalMs = Math.max(0, Number(options.intervalMs) || 0);
  const initialDelayMs = Math.max(0, Number(options.initialDelayMs) || 0);
  const setTimer = options.setTimer || setTimeout;
  const clearTimer = options.clearTimer || clearTimeout;
  const onError = typeof options.onError === 'function' ? options.onError : () => {};
  let timer = null;
  let stopped = false;
  let running = false;

  async function tick() {
    if (stopped || running) return;
    running = true;
    try {
      await task();
    } catch (error) {
      onError(error);
    } finally {
      running = false;
      if (!stopped) timer = setTimer(tick, intervalMs);
    }
  }

  timer = setTimer(tick, initialDelayMs);

  return {
    stop() {
      stopped = true;
      if (timer !== null) clearTimer(timer);
    },
    isRunning() {
      return running;
    }
  };
}

module.exports = { startSerialPolling };
