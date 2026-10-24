// Mesma classificação para o servidor e os cards do painel.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.InfoBoardAgentState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // npxQueuePresent indica apenas existencia na resposta do monitor da fila NPX;
  // nao confirma login operacional nem registro SIP do softphone.
  function parseSipRegistration(value) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === 0) return value === 1;
    if (typeof value === 'string') {
      const state = value.trim().toLowerCase();
      if (['true', '1', 'online', 'registered', 'registrado'].includes(state)) return true;
      if (['false', '0', 'offline', 'unregistered', 'desregistrado'].includes(state)) return false;
    }
    return null;
  }

  function getNpxSipRegistration(agent, { explicitOnly = false } = {}) {
    // Aceitar representações explícitas da API, sem confundir com o status da fila.
    for (const field of ['npxSipRegistered', 'sip_registered', 'sipRegistered', 'device_registered', 'deviceRegistered']) {
      const registered = parseSipRegistration(agent[field]);
      if (registered !== null) return registered;
    }
    // Uma chamada na fila indica atividade, mas nao comprova REGISTER no SIP.
    // Em homologacao estrita, apenas um campo explicito pode confirmar o registro.
    if (explicitOnly) return null;
    const src = String(agent.src || '');
    const dst = String(agent.dst || '');
    const isExternal = number => /\d{8,}/.test(number) && !String(number).startsWith('4422');
    if (Number(agent.status) === 2 && (isExternal(src) || isExternal(dst))) return true;
    return null; // A API de filas nao confirmou nem negou o registro SIP.
  }

  function getNpxOperationalStatus(agent) {
    // O servidor valida agente/fila e a origem do GET; aqui validamos o contrato
    // e a idade da observacao. Nunca inferir REGISTER a partir deste estado.
    const observation = agent.npxOperational;
    if (!observation || typeof observation !== 'object' || Array.isArray(observation) ||
      observation.source !== 'npx-queue-monitor' ||
      ![0, 1, 2, 5, -1, '0', '1', '2', '5', '-1'].includes(observation.status)) return null;
    if (!Object.prototype.hasOwnProperty.call(observation, 'agentCode') ||
      typeof observation.agentCode !== 'string' || !observation.agentCode ||
      observation.agentCode !== String(agent.code)) return null;
    if (!Object.prototype.hasOwnProperty.call(observation, 'queue') ||
      typeof observation.queue !== 'string' || !observation.queue || observation.queue !== agent.npxQueue) return null;
    const timestamp = observation.observedAt;
    if (typeof timestamp !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(timestamp)) return null;
    const observedAt = Date.parse(timestamp);
    const calendarDate = Date.parse(timestamp.slice(0, 10) + 'T00:00:00Z');
    if (!Number.isFinite(observedAt) || !Number.isFinite(calendarDate) ||
      new Date(calendarDate).toISOString().slice(0, 10) !== timestamp.slice(0, 10)) return null;
    const age = Date.now() - observedAt;
    return age >= -5000 && age <= 30000 ? Number(observation.status) : null;
  }

  function getAgentConnectionState(agent) {
    const srcText = String(agent.src || '');
    const dstText = String(agent.dst || '');
    const isPauseName = value => /[a-zA-Z_]/i.test(value) &&
      !value.startsWith('8520') && !value.startsWith('8530') && !value.startsWith('085');
    const isSrcPauseName = isPauseName(srcText);
    const isDstPauseName = isPauseName(dstText);
    const pauseName = isSrcPauseName ? srcText : (isDstPauseName ? dstText : (agent.pause_name || 'Pausa'));

    const isRealClientPhone = value => {
      const phone = String(value || '').trim();
      if (!phone || (/[a-zA-Z_]/i.test(phone) && !phone.startsWith('085') && !phone.startsWith('85'))) return false;
      if (phone.startsWith('4422')) return false;
      if (phone === String(agent.code) || phone === String(agent.extension) || phone === String(agent.ramal)) return false;
      if (/^20\d{2}$/.test(phone)) return false;
      return phone.length >= 8;
    };

    const hasRealPhoneSrc = isRealClientPhone(srcText);
    const hasRealPhoneDst = isRealClientPhone(dstText);
    // Registro confirmado pelo PBX tem precedencia sobre qualquer estado de fila NPX.
    // Isso impede que um unico analista pareca conectado aos dois servicos.
    const isPbxRegistered = agent.pbxStatus === 'Free' || agent.pbxStatus === 'Busy';
    const isRealPbxCall = agent.pbxStatus === 'Busy';
    const isPbxConfirmedDisconnected = agent.pbxMonitorConfirmed === true && agent.pbxStatus === 'Offline';
    const requireNpxSipConfirmation = agent.npxRequireSipConfirmation === true;
    // Campo presente mas invalido NAO permite fallback ao gate SIP antigo.
    const useNpxOperational = requireNpxSipConfirmation &&
      Object.prototype.hasOwnProperty.call(agent, 'npxOperational');
    const npxOperationalStatus = useNpxOperational ? getNpxOperationalStatus(agent) : null;
    const hasNpxOperationalStatus = npxOperationalStatus !== null;
    const npxSipRegistered = isPbxRegistered && !useNpxOperational ? false :
      getNpxSipRegistration(agent, { explicitOnly: requireNpxSipConfirmation });
    const isNpxQueuePresent = !isPbxRegistered && agent.npxQueuePresent === true;
    const isNpxOperationalUnknown = isNpxQueuePresent && useNpxOperational && !hasNpxOperationalStatus;
    // No contrato novo, apenas o monitor atual determina o estado operacional.
    // Sem o campo, preservar o modo estrito anterior por compatibilidade.
    const npxStatus = useNpxOperational ? npxOperationalStatus : Number(agent.status);
    const isNpxQueueDisconnected = isNpxQueuePresent && requireNpxSipConfirmation &&
      (useNpxOperational ? npxOperationalStatus === 0 : (agent.status === 0 || agent.status === '0'));
    const isDisconnectedBoth = isNpxQueueDisconnected && isPbxConfirmedDisconnected;
    const isNpxQueueAvailable = isNpxQueuePresent && !isNpxQueueDisconnected;
    const isNpxQueueOnline = isNpxQueueAvailable && (useNpxOperational
      ? hasNpxOperationalStatus : (!requireNpxSipConfirmation || npxSipRegistered === true));
    const isNpxSipUnknown = !useNpxOperational && isNpxQueueAvailable && requireNpxSipConfirmation && npxSipRegistered === null;
    const isNpxSipDisconnected = !useNpxOperational && isNpxQueueAvailable && requireNpxSipConfirmation && npxSipRegistered === false;
    const isRealNpxCall = isNpxQueueOnline && npxStatus === 2 && (hasRealPhoneSrc || hasRealPhoneDst);
    const isPaused = isNpxQueueOnline && (agent.paused == 1 || npxStatus === -1 ||
      (!useNpxOperational && (npxStatus === 5 || isSrcPauseName || isDstPauseName)));
    const isNpxBusy = isNpxQueueOnline && useNpxOperational && npxStatus === 2 && !isPaused;
    const isNpxRinging = isNpxQueueOnline && useNpxOperational && npxStatus === 5 && !isPaused;

    return {
      srcText, dstText, isSrcPauseName, isDstPauseName, pauseName,
      hasRealPhoneSrc, hasRealPhoneDst, isRealPbxCall, isRealNpxCall,
      isCallActive: isRealPbxCall || isRealNpxCall, isPaused, npxSipRegistered,
      isPbxRegistered, isPbxConfirmedDisconnected, isDisconnectedBoth,
      isNpxQueueOnline, isNpxQueueDisconnected, isNpxSipUnknown, isNpxSipDisconnected,
      npxOperationalStatus, hasNpxOperationalStatus, isNpxOperationalUnknown, isNpxBusy, isNpxRinging,
      connectionSource: isPbxRegistered ? 'pbx' : (isNpxQueueOnline ? 'npx' : null)
    };
  }

  function getAgentPriority(agent) {
    const state = getAgentConnectionState(agent);
    if (state.isRealPbxCall) return 1;
    if (state.isPaused) return 3;
    if (state.isRealNpxCall || state.isNpxBusy || state.isNpxRinging) return 2;
    if (state.isPbxRegistered) return 4;
    if (state.isNpxQueueOnline) return 5;
    return 6;
  }

  function getAgentCategory(agent) {
    const priority = getAgentPriority(agent);
    if (priority === 3) return 'paused';
    if (priority <= 2) return 'busy';
    if (priority <= 5) return 'free';
    return 'offline';
  }

  // O telefone exibido deve pertencer ao mesmo ramal que define a cor do card.
  // Se ambas as fontes reportarem chamada, o registro PBX confirmado prevalece.
  function getAgentDisplayedCall(agent) {
    const state = getAgentConnectionState(agent);
    if (state.isRealPbxCall) {
      const pbxNumber = String(agent.pbxNumber || '');
      return {
        source: 'pbx',
        number: pbxNumber.length >= 8 ? pbxNumber : 'Em Ligação',
        outbound: agent.pbxDirection === 0
      };
    }
    if (state.isRealNpxCall) {
      return {
        source: 'npx',
        number: state.hasRealPhoneDst ? state.dstText : state.srcText,
        outbound: state.hasRealPhoneDst
      };
    }
    return { source: null, number: 'Em Ligação', outbound: false };
  }

  return { getNpxSipRegistration, getAgentConnectionState, getAgentPriority, getAgentCategory, getAgentDisplayedCall };
});
