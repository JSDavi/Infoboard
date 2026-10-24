const test = require('node:test');
const assert = require('node:assert/strict');
const { withNpxMonitorObservation } = require('../npx-monitor-state');
const { getAgentConnectionState, getAgentCategory } = require('../public/agent-state');

test('resposta do monitor NPX preserva zero, identidade e horario sem transformar em registro SIP', () => {
  const raw = [{ code: '4422002', extension: '4422002', status: 0, paused: 0 }];
  const observedAt = new Date().toISOString();
  const [agent] = withNpxMonitorObservation(raw, 'InfoBrasil_Suporte', observedAt);
  assert.equal(agent.status, 0);
  assert.equal(agent.npxOperational.status, 0);
  assert.equal(agent.npxOperational.source, 'npx-queue-monitor');
  assert.equal(agent.npxOperational.agentCode, '4422002');
  assert.equal(agent.npxOperational.queue, 'InfoBrasil_Suporte');
  assert.equal(agent.npxOperational.observedAt, observedAt);
  assert.equal(agent.npxSipRegistered, undefined);
  assert.deepEqual(raw, [{ code: '4422002', extension: '4422002', status: 0, paused: 0 }]);
});

test('contrato de coleta rejeita HTML/login ou lista de agentes malformada', () => {
  for (const details of [null, undefined, '<html>login</html>', {}, [null], [1], [[]]]) {
    assert.throws(() => withNpxMonitorObservation(details, 'InfoBrasil_Suporte'));
  }
  assert.deepEqual(withNpxMonitorObservation([], 'InfoBrasil_Suporte'), []);
});

test('respostas oficiais sucessivas atualizam a classificacao sem precisar de SIP informado', () => {
  const categories = [0, 1, 0].map(status => {
    const [observed] = withNpxMonitorObservation([{ code: '4422002', status, paused: 0 }], 'InfoBrasil_Suporte');
    const agent = { ...observed, npxQueuePresent: true, npxRequireSipConfirmation: true,
      npxSipRegistered: null, pbxStatus: 'Offline' };
    assert.equal(getAgentConnectionState(agent).npxSipRegistered, null);
    return getAgentCategory(agent);
  });
  assert.deepEqual(categories, ['offline', 'free', 'offline']);
});
