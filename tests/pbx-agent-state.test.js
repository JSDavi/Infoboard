const test = require('node:test');
const assert = require('node:assert/strict');
const { applyPbxObservationToAgent } = require('../pbx-agent-state');
const { getAgentConnectionState } = require('../public/agent-state');

function npxOffline(queue) {
  return {
    name: 'Davi', code: '4422002', ramal: '2002', npxQueue: queue,
    npxQueuePresent: true, npxRequireSipConfirmation: true, status: 0,
    npxOperational: { source: 'npx-queue-monitor', agentCode: '4422002',
      queue, status: 0, observedAt: new Date().toISOString() }
  };
}

test('PBX desregistrado e confirmado tem mesma classificação nas cinco filas NPX', () => {
  for (const currentQueue of [
    'InfoBrasil_Comercial', 'Infobrasil_finan', 'InfoBrasil_SPED_Fiscal',
    'InfoBrasil_Suporte', 'InfoBrasil_Ponto'
  ]) {
    const agent = npxOffline(currentQueue);
    applyPbxObservationToAgent(agent, {
      pbxInfo: { status: 'Offline' }, ramal: '2002',
      mappedQueue: 'InfoBrasil_Suporte', currentQueue
    });
    assert.equal(agent.pbxMonitorConfirmed, true);
    assert.equal(agent.pbxStatus, 'Offline');
    const state = getAgentConnectionState(agent);
    assert.equal(state.isDisconnectedBoth, true);
    assert.equal(state.isNpxQueueOnline, false);
  }
});

test('PBX sem observação atual não é presumido desregistrado', () => {
  const agent = npxOffline('InfoBrasil_SPED_Fiscal');
  applyPbxObservationToAgent(agent, {
    pbxInfo: undefined, ramal: '2002',
    mappedQueue: 'InfoBrasil_Suporte', currentQueue: 'InfoBrasil_SPED_Fiscal'
  });
  assert.equal(agent.pbxMonitorConfirmed, false);
  assert.equal(agent.pbxStatus, undefined);
  assert.equal(getAgentConnectionState(agent).isDisconnectedBoth, false);
});

test('PBX registrado em outro setor não se torna segunda presença PBX', () => {
  const agent = npxOffline('InfoBrasil_SPED_Fiscal');
  applyPbxObservationToAgent(agent, {
    pbxInfo: { status: 'Free', number: '' }, ramal: '2002',
    mappedQueue: 'InfoBrasil_Suporte', currentQueue: 'InfoBrasil_SPED_Fiscal'
  });
  assert.equal(agent.pbxMonitorConfirmed, true);
  assert.equal(agent.pbxStatus, undefined);
  assert.equal(getAgentConnectionState(agent).isPbxRegistered, false);
});

test('PBX registrado no setor cadastrado conserva status e chamada', () => {
  const agent = npxOffline('InfoBrasil_Suporte');
  applyPbxObservationToAgent(agent, {
    pbxInfo: { status: 'Busy', number: '85999999999', duration: 20,
      durationStr: '00:20', direction: 1 }, ramal: '2002',
    mappedQueue: 'InfoBrasil_Suporte', currentQueue: 'InfoBrasil_Suporte'
  });
  assert.equal(agent.pbxMonitorConfirmed, true);
  assert.equal(agent.pbxStatus, 'Busy');
  assert.equal(agent.pbxNumber, '85999999999');
  assert.equal(getAgentConnectionState(agent).isRealPbxCall, true);
});
