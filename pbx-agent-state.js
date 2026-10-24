// O registro SIP pertence ao ramal, não à fila em que o monitor NPX o exibe.
// Aplicamos a desconexão PBX confirmada em qualquer fila, preservando a
// precedência dos cards PBX livres/ocupados no departamento cadastrado.
function applyPbxObservationToAgent(agent, { pbxInfo, ramal, mappedQueue, currentQueue }) {
  const confirmed = !!ramal && ['Offline', 'Free', 'Busy'].includes(pbxInfo?.status);
  agent.pbxMonitorConfirmed = confirmed;
  if (!confirmed) return;

  if (mappedQueue !== currentQueue) {
    if (pbxInfo.status === 'Offline') agent.pbxStatus = 'Offline';
    return;
  }

  agent.pbxStatus = pbxInfo.status;
  agent.pbxNumber = pbxInfo.number;
  agent.pbxDuration = pbxInfo.duration;
  agent.pbxDurationStr = pbxInfo.durationStr;
  agent.pbxDirection = pbxInfo.direction;
}

module.exports = { applyPbxObservationToAgent };
