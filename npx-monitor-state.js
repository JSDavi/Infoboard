'use strict';

// Contrato observado no monitor oficial: 0 desligado, 1 livre, 2 ocupado,
// 5 chamando, -1 pausa. Trata-se de estado operacional, nao de SIP REGISTER.
function withNpxMonitorObservation(details, queue, observedAt = new Date().toISOString()) {
  if (!Array.isArray(details) || details.some(agent => !agent || typeof agent !== 'object' || Array.isArray(agent))) {
    throw new Error('Resposta de detalhes NPX invalida');
  }
  if (typeof queue !== 'string' || !queue || typeof observedAt !== 'string' || !Number.isFinite(Date.parse(observedAt))) {
    throw new Error('Contexto da observacao NPX invalido');
  }
  return details.map(agent => ({
    ...agent,
    npxQueue: queue,
    npxOperational: {
      source: 'npx-queue-monitor',
      agentCode: String(agent.code || ''),
      queue,
      status: agent.status,
      observedAt
    }
  }));
}

module.exports = { withNpxMonitorObservation };
