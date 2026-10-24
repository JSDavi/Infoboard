const { getAgentCategory, getAgentPriority, getAgentConnectionState } = require('./public/agent-state');

// O mesmo ramal pode aparecer em respostas NPX de filas diferentes devido a
// atualização assíncrona. Escolhemos um único card operacional por coleta.
function reconcileAgentQueues(departments) {
  const chosen = new Map();
  const candidates = [];

  for (const [queue, department] of Object.entries(departments)) {
    for (const agent of department.agents || []) {
      const digits = String(agent.ramal || agent.code || agent.extension || '').replace(/\D/g, '');
      // Apenas ramais identificáveis podem ser conciliados com segurança.
      if (digits.length < 4) continue;
      const key = digits.slice(-4);
      const state = getAgentConnectionState(agent);
      // Uma presenca NPX ativa e recente na fila de destino pode coexistir
      // com registro PBX livre atribuido ao departamento de origem.
      // Chamadas PBX ocupadas continuam tendo precedencia operacional.
      const npxConfirmed = agent.npxRequireSipConfirmation === true &&
        state.hasNpxOperationalStatus && state.isNpxQueueOnline;
      const rank = state.isRealPbxCall ? 5 : npxConfirmed ? 4 :
        state.isPbxRegistered ? 3 : (state.isNpxQueueOnline ? 2 : 1);
      const candidate = { queue, agent, key, rank, priority: getAgentPriority(agent) };
      candidates.push(candidate);
      const previous = chosen.get(key);
      if (!previous || rank > previous.rank || (rank === previous.rank && candidate.priority < previous.priority)) {
        chosen.set(key, candidate);
      }
    }
  }

  const losers = new Map();
  for (const item of candidates) {
    if (chosen.get(item.key) !== item) {
      if (!losers.has(item.queue)) losers.set(item.queue, new Set());
      losers.get(item.queue).add(item.agent);
    }
  }

  for (const [queue, department] of Object.entries(departments)) {
    const rejected = losers.get(queue);
    if (rejected?.size) {
      department.agents = department.agents.filter(agent => !rejected.has(agent));
      const keptCalls = new Set(department.agents.map(agent => 'real-act-' + agent.code));
      department.calls = (department.calls || []).filter(call =>
        !String(call.id || '').startsWith('real-act-') || keptCalls.has(call.id));
    }
    const types = (department.agents || []).map(getAgentCategory);
    department.agents_busy = types.filter(type => type === 'busy').length;
    department.agents_paused = types.filter(type => type === 'paused').length;
    department.agents_free = types.filter(type => type === 'free').length;
    department.agents_online = department.agents_busy + department.agents_paused + department.agents_free;
    department.active = department.agents_busy;
  }
  return departments;
}

module.exports = { reconcileAgentQueues };
