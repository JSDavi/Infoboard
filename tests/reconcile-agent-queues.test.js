const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcileAgentQueues } = require('../reconcile-agent-queues');

function dept(agents, calls = []) {
  return { agents, calls, queue: 0, agents_online: 0, agents_busy: 0, agents_paused: 0, agents_free: 0 };
}

test('PBX confirmado ocupa apenas um departamento, mesmo com NPX residual em outro', () => {
  const departments = {
    InfoBrasil_Comercial: dept([{ name: 'Ana', code: '4422000', ramal: '2000', npxQueuePresent: true, status: 2, dst: '85999998888' }],
      [{ id: 'real-act-4422000', status: 'Atendimento' }]),
    InfoBrasil_Suporte: dept([{ name: 'Ana', ramal: '2000', pbxStatus: 'Free', npxQueuePresent: false, status: 0 }])
  };
  reconcileAgentQueues(departments);
  assert.equal(departments.InfoBrasil_Comercial.agents.length, 0);
  assert.equal(departments.InfoBrasil_Comercial.calls.length, 0);
  assert.equal(departments.InfoBrasil_Comercial.agents_online, 0);
  assert.equal(departments.InfoBrasil_Suporte.agents_online, 1);
  assert.equal(departments.InfoBrasil_Suporte.agents_free, 1);
});

test('NPX confirmado mantém apenas um card e favorece a fila em atendimento', () => {
  const departments = {
    Suporte: dept([{ name: 'A', code: '4422002', npxQueuePresent: true, status: 1 }]),
    Comercial: dept([{ name: 'A', code: '4422002', npxQueuePresent: true, status: 2, dst: '85999999999' }])
  };
  reconcileAgentQueues(departments);
  assert.equal(departments.Suporte.agents_online, 0);
  assert.equal(departments.Comercial.agents_busy, 1);
});

test('dois ramais diferentes permanecem visíveis e chamadas aguardando não somem', () => {
  const departments = {
    Suporte: dept([{ code: '4422002', npxQueuePresent: true, status: 1 }], [{ id: 'real-wait-abc', status: 'Fila' }]),
    Comercial: dept([{ code: '4422003', npxQueuePresent: true, status: 1 }])
  };
  reconcileAgentQueues(departments);
  assert.equal(departments.Suporte.agents_online, 1);
  assert.equal(departments.Comercial.agents_online, 1);
  assert.equal(departments.Suporte.calls.length, 1);
});

test('fila NPX realmente ativa vence o cadastro PBX livre do departamento anterior', () => {
  const departments = {
    InfoBrasil_Suporte: dept([{ name: 'Davi', ramal: '2002', pbxStatus: 'Free', npxQueuePresent: false, status: 0 }]),
    InfoBrasil_Comercial: dept([{
      name: 'Davi', code: '4422002', ramal: '2002', status: 1,
      npxQueue: 'InfoBrasil_Comercial', npxQueuePresent: true,
      npxRequireSipConfirmation: true,
      npxOperational: { source: 'npx-queue-monitor', agentCode: '4422002',
        queue: 'InfoBrasil_Comercial', status: 1, observedAt: new Date().toISOString() }
    }])
  };
  reconcileAgentQueues(departments);
  assert.equal(departments.InfoBrasil_Suporte.agents_online, 0);
  assert.equal(departments.InfoBrasil_Comercial.agents_free, 1);
});
