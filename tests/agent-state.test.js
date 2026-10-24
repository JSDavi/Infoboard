const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const {
  getNpxSipRegistration,
  getAgentConnectionState,
  getAgentPriority,
  getAgentCategory,
  getAgentDisplayedCall
} = require('../public/agent-state');

test('PBX livre confirmado prevalece sobre registro NPX ainda marcado como ativo', () => {
  const agent = { status: 1, npxSipRegistered: true, pbxStatus: 'Free' };
  assert.equal(getAgentPriority(agent), 4);
  assert.equal(getAgentCategory(agent), 'free');
  assert.equal(getAgentConnectionState(agent).connectionSource, 'pbx');
  assert.equal(getAgentConnectionState(agent).npxSipRegistered, false);
});

test('estar livre na fila NPX nao confirma registro no MicroSIP', () => {
  const agent = { status: 1, pbxStatus: 'Offline', total_loged_time: '04:15:30' };
  assert.equal(getAgentConnectionState(agent).npxSipRegistered, null);
  assert.equal(getAgentPriority(agent), 6);
  assert.equal(getAgentCategory(agent), 'offline');
});

test('registro SIP explícito aceita booleano, número e texto sem inferir a partir da fila', () => {
  for (const state of [true, 1, '1', 'online', 'REGISTERED', 'registrado']) {
    assert.equal(getAgentConnectionState({ status: 0, sip_registered: state }).npxSipRegistered, true);
  }
  for (const state of [false, 0, '0', 'offline', 'UNREGISTERED', 'desregistrado']) {
    assert.equal(getAgentConnectionState({ status: 1, device_registered: state }).npxSipRegistered, false);
  }
  for (const state of [null, 'unknown', '']) {
    assert.equal(getAgentConnectionState({ status: 1, sip_registered: state }).npxSipRegistered, null);
  }
});

test('desconectado do NPX pode continuar livre no PBX', () => {
  const agent = { status: 1, npxSipRegistered: false, pbxStatus: 'Free' };
  assert.equal(getAgentPriority(agent), 4);
  assert.equal(getAgentCategory(agent), 'free');
});

test('registro SIP isolado nao comprova login operacional na fila NPX', () => {
  const agent = { status: 0, npxSipRegistered: true, total_loged_time: '00:00:00' };
  assert.equal(getAgentPriority(agent), 6);
  assert.equal(getAgentCategory(agent), 'offline');
  assert.equal(getAgentConnectionState(agent).npxSipRegistered, true);
});

test('ramal secundário PBX livre sem NPX permanece disponível', () => {
  const agent = { status: 0, pbxStatus: 'Free' };
  assert.equal(getAgentPriority(agent), 4);
  assert.equal(getAgentCategory(agent), 'free');
});

test('ligação no PBX sem NPX ocupa o analista', () => {
  const agent = { status: 0, pbxStatus: 'Busy', pbxNumber: '85999998888' };
  assert.equal(getAgentConnectionState(agent).isRealPbxCall, true);
  assert.equal(getAgentPriority(agent), 1);
  assert.equal(getAgentCategory(agent), 'busy');
});

test('PBX ocupado prevalece sobre chamada NPX reportada na fila', () => {
  const agent = { status: 2, dst: '85999998888', pbxStatus: 'Busy', pbxNumber: '85988887777', pbxDirection: 1 };
  assert.equal(getAgentConnectionState(agent).isRealNpxCall, false);
  assert.equal(getAgentConnectionState(agent).connectionSource, 'pbx');
  assert.equal(getAgentPriority(agent), 1);
  assert.equal(getAgentCategory(agent), 'busy');
  assert.deepEqual(getAgentDisplayedCall(agent), {
    source: 'pbx', number: '85988887777', outbound: false
  });
});

test('PBX livre suprime chamada e pausa antigas do NPX sem gerar falso ocupado', () => {
  const agent = {
    status: 2, paused: 1, src: 'Almoço', dst: '85999998888',
    npxSipRegistered: true, pbxStatus: 'Free'
  };
  const state = getAgentConnectionState(agent);
  assert.equal(state.isPbxRegistered, true);
  assert.equal(state.isRealNpxCall, false);
  assert.equal(state.isPaused, false);
  assert.equal(state.isCallActive, false);
  assert.equal(getAgentPriority(agent), 4);
  assert.equal(getAgentCategory(agent), 'free');
  assert.equal(getAgentDisplayedCall(agent).source, null);
});

test('presenca confirmada no monitor NPX habilita chamadas sem depender da confirmacao SIP', () => {
  const agent = { status: 2, dst: '85999998888', npxQueuePresent: true, pbxStatus: 'Offline' };
  const state = getAgentConnectionState(agent);
  assert.equal(state.connectionSource, 'npx');
  assert.equal(state.isRealNpxCall, true);
  assert.equal(getAgentPriority(agent), 2);
  assert.equal(getAgentDisplayedCall(agent).source, 'npx');
});

test('PBX desconectado sem confirmação NPX continua cinza mesmo estando na fila', () => {
  const state = getAgentConnectionState({ status: 1, pbxStatus: 'Offline' });
  assert.equal(state.connectionSource, null);
  assert.equal(state.npxSipRegistered, null);
});

test('chamada PBX usa numero e direcao PBX quando NPX esta livre', () => {
  const agent = { status: 1, dst: '', pbxStatus: 'Busy', pbxNumber: '85988887777', pbxDirection: 1 };
  assert.deepEqual(getAgentDisplayedCall(agent), {
    source: 'pbx', number: '85988887777', outbound: false
  });
});

test('ramais internos e número próprio não contam como telefone de cliente NPX', () => {
  for (const phone of ['2002', '44221234', '']) {
    const agent = { status: 2, dst: phone, code: '2002', pbxStatus: 'Offline' };
    assert.equal(getAgentConnectionState(agent).isRealNpxCall, false);
  }
});

test('pausa NPX não prevalece sobre ligação PBX confirmada', () => {
  const pausedOnCall = { status: 5, paused: 1, npxSipRegistered: true, pbxStatus: 'Busy' };
  assert.equal(getAgentConnectionState(pausedOnCall).isCallActive, true);
  assert.equal(getAgentConnectionState(pausedOnCall).isPaused, false);
  assert.equal(getAgentPriority(pausedOnCall), 1);
  assert.equal(getAgentCategory(pausedOnCall), 'busy');
});

test('pausa na fila NPX sem registro SIP nao sobrepoe ramal PBX ativo', () => {
  const agent = { status: 5, paused: 1, npxSipRegistered: false, pbxStatus: 'Busy' };
  assert.equal(getAgentConnectionState(agent).isPaused, false);
  assert.equal(getAgentPriority(agent), 1);
});

test('ligacao NPX com destino externo e presenca na fila comprova uso ativo do ramal', () => {
  const agent = { status: 2, dst: '85999998888', pbxStatus: 'Offline', npxQueuePresent: true };
  assert.equal(getAgentConnectionState(agent).npxSipRegistered, true);
  assert.equal(getAgentPriority(agent), 2);
});

test('pausa identificada pelo nome persiste durante ligação NPX', () => {
  const agent = { status: 2, src: 'Almoço', dst: '85999998888', npxQueuePresent: true };
  const state = getAgentConnectionState(agent);
  assert.equal(state.pauseName, 'Almoço');
  assert.equal(state.isPaused, true);
  assert.equal(state.isRealNpxCall, true);
  assert.equal(getAgentCategory(agent), 'paused');
});

test('login na fila NPX aparece verde escuro mesmo com SIP desconhecido', () => {
  const agent = { status: 1, pbxStatus: 'Offline', npxSipRegistered: null, npxQueuePresent: true };
  assert.equal(getAgentConnectionState(agent).isNpxQueueOnline, true);
  assert.equal(getAgentConnectionState(agent).connectionSource, 'npx');
  assert.equal(getAgentPriority(agent), 5);
  assert.equal(getAgentCategory(agent), 'free');
});

test('homologacao estrita nao marca verde quando ramal 2002 esta na fila com SIP desconhecido', () => {
  const agent = { code: '4422002', ramal: '2002', status: 1, pbxStatus: 'Offline',
    npxQueuePresent: true, npxSipRegistered: null, npxRequireSipConfirmation: true };
  const state = getAgentConnectionState(agent);
  assert.equal(state.isNpxQueueOnline, false);
  assert.equal(state.isNpxSipUnknown, true);
  assert.equal(state.isNpxSipDisconnected, false);
  assert.equal(state.connectionSource, null);
  assert.equal(getAgentCategory(agent), 'offline');
});

test('homologacao usa status 0 do monitor NPX para desligado sem afirmar registro SIP', () => {
  for (const status of [0, '0']) {
    for (const registration of [null, true, false]) {
      const agent = { code: '4422002', ramal: '2002', status, pbxStatus: 'Offline',
        npxQueuePresent: true, npxSipRegistered: registration, npxRequireSipConfirmation: true };
      const state = getAgentConnectionState(agent);
      assert.equal(state.isNpxQueueDisconnected, true);
      assert.equal(state.isNpxQueueOnline, false);
      assert.equal(state.isNpxSipUnknown, false);
      assert.equal(state.isNpxSipDisconnected, false);
      assert.equal(state.npxSipRegistered, registration);
      assert.equal(state.connectionSource, null);
      assert.equal(getAgentCategory(agent), 'offline');
    }
  }
});

test('homologacao distingue desligado de SIP desconhecido e respeita PBX', () => {
  const base = { status: 0, npxQueuePresent: true, npxRequireSipConfirmation: true };
  assert.equal(getAgentConnectionState({ ...base, pbxStatus: 'Offline' }).isNpxQueueDisconnected, true);
  const pbx = getAgentConnectionState({ ...base, pbxStatus: 'Free' });
  assert.equal(pbx.connectionSource, 'pbx');
  assert.equal(pbx.isNpxQueueDisconnected, false);
  assert.equal(getAgentCategory({ ...base, pbxStatus: 'Free' }), 'free');
  const ready = getAgentConnectionState({ ...base, status: 1, pbxStatus: 'Offline', npxSipRegistered: null });
  assert.equal(ready.isNpxQueueDisconnected, false);
  assert.equal(ready.isNpxSipUnknown, true);
});

test('mensagem dos dois ramais exige NPX desligado e PBX Offline confirmado', () => {
  const base = { status: 0, npxQueuePresent: true, npxRequireSipConfirmation: true,
    pbxStatus: 'Offline', pbxMonitorConfirmed: true };
  const both = getAgentConnectionState(base);
  assert.equal(both.isDisconnectedBoth, true);
  assert.equal(both.isPbxConfirmedDisconnected, true);
  assert.equal(both.connectionSource, null);
  assert.equal(getAgentCategory(base), 'offline');

  for (const pbxMonitorConfirmed of [false, undefined]) {
    const unknown = getAgentConnectionState({ ...base, pbxMonitorConfirmed });
    assert.equal(unknown.isNpxQueueDisconnected, true);
    assert.equal(unknown.isDisconnectedBoth, false);
  }
  const pbx = getAgentConnectionState({ ...base, pbxStatus: 'Free' });
  assert.equal(pbx.isPbxRegistered, true);
  assert.equal(pbx.isDisconnectedBoth, false);
  assert.equal(pbx.connectionSource, 'pbx');
  const npx = getAgentConnectionState({ ...base, status: 1, npxSipRegistered: true });
  assert.equal(npx.isNpxQueueOnline, true);
  assert.equal(npx.isDisconnectedBoth, false);
  assert.equal(npx.connectionSource, 'npx');
});

test('homologacao estrita distingue registro NPX confirmado e SIP desconectado', () => {
  const base = { status: 1, pbxStatus: 'Offline', npxQueuePresent: true,
    npxRequireSipConfirmation: true };
  const online = getAgentConnectionState({ ...base, npxSipRegistered: 'ONLINE' });
  assert.equal(online.isNpxQueueOnline, true);
  assert.equal(online.connectionSource, 'npx');
  assert.equal(getAgentCategory({ ...base, npxSipRegistered: true }), 'free');
  const offline = getAgentConnectionState({ ...base, npxSipRegistered: 'OFFLINE' });
  assert.equal(offline.isNpxQueueOnline, false);
  assert.equal(offline.isNpxSipDisconnected, true);
  assert.equal(offline.isNpxSipUnknown, false);
  assert.equal(getAgentCategory({ ...base, npxSipRegistered: false }), 'offline');
});

test('homologacao estrita nao confunde uma chamada NPX com registro SIP', () => {
  const agent = { status: 2, dst: '85999998888', pbxStatus: 'Offline',
    npxQueuePresent: true, npxRequireSipConfirmation: true };
  const state = getAgentConnectionState(agent);
  assert.equal(state.npxSipRegistered, null);
  assert.equal(state.isNpxSipUnknown, true);
  assert.equal(state.isNpxQueueOnline, false);
  assert.equal(getAgentCategory(agent), 'offline');
  assert.equal(getNpxSipRegistration(agent, { explicitOnly: true }), null);
});

test('homologacao estrita respeita precedencia PBX, mesmo com SIP NPX desconhecido', () => {
  const agent = { status: 1, npxQueuePresent: true, npxSipRegistered: null,
    npxRequireSipConfirmation: true, pbxStatus: 'Free' };
  const state = getAgentConnectionState(agent);
  assert.equal(state.isPbxRegistered, true);
  assert.equal(state.isNpxSipUnknown, false);
  assert.equal(state.connectionSource, 'pbx');
  assert.equal(getAgentCategory(agent), 'free');
});

test('saida da fila NPX torna card offline mesmo com MicroSIP registrado', () => {
  const agent = { status: 1, pbxStatus: 'Offline', npxSipRegistered: true, npxQueuePresent: false };
  assert.equal(getAgentConnectionState(agent).isNpxQueueOnline, false);
  assert.equal(getAgentCategory(agent), 'offline');
});

test('PBX tem precedencia sobre presenca residual em fila NPX', () => {
  const agent = { status: 1, pbxStatus: 'Free', npxQueuePresent: true };
  assert.equal(getAgentConnectionState(agent).isNpxQueueOnline, false);
  assert.equal(getAgentConnectionState(agent).connectionSource, 'pbx');
  assert.equal(getAgentPriority(agent), 4);
});

test('sem conexão nos dois serviços o estado é offline', () => {
  for (const agent of [{ status: 0, pbxStatus: 'Offline' }, { status: undefined }]) {
    assert.equal(getAgentPriority(agent), 6);
    assert.equal(getAgentCategory(agent), 'offline');
  }
});

test('módulo publicado no navegador usa as mesmas regras do Node', () => {
  const script = fs.readFileSync(path.join(__dirname, '../public/agent-state.js'), 'utf8');
  const browser = { window: {} };
  vm.runInNewContext(script, browser);
  const agent = { status: 0, pbxStatus: 'Busy' };
  assert.equal(browser.InfoBoardAgentState.getAgentPriority(agent), getAgentPriority(agent));
});

const operationalNow = Date.parse('2026-10-18T12:00:00.000Z');
function operationalAgent(status, overrides = {}) {
  return {
    code: '4422002', ramal: '2002', status: 1, paused: 0, src: '', dst: '',
    pbxStatus: 'Offline', npxQueuePresent: true, npxSipRegistered: null, npxQueue: 'InfoBrasil_Suporte',
    npxRequireSipConfirmation: true,
    npxOperational: { status, source: 'npx-queue-monitor', observedAt: new Date(operationalNow).toISOString(),
      agentCode: '4422002', queue: 'InfoBrasil_Suporte' },
    ...overrides
  };
}

test('monitor atual prova sequencia 0 -> 1 -> 0 com payload de fila e SIP null constantes', t => {
  let now = operationalNow;
  t.mock.method(Date, 'now', () => now);
  const agent = operationalAgent(0);
  for (const status of [0, 1, 0]) {
    agent.npxOperational = { ...agent.npxOperational, status, observedAt: new Date(now).toISOString() };
    const before = JSON.stringify(agent);
    const state = getAgentConnectionState(agent);
    assert.equal(state.npxOperationalStatus, status);
    assert.equal(state.hasNpxOperationalStatus, true);
    assert.equal(state.isNpxOperationalUnknown, false);
    assert.equal(state.isNpxQueueDisconnected, status === 0);
    assert.equal(state.isNpxQueueOnline, status === 1);
    assert.equal(state.connectionSource, status === 1 ? 'npx' : null);
    assert.equal(state.npxSipRegistered, null);
    assert.equal(state.isNpxSipUnknown, false);
    assert.equal(state.isNpxSipDisconnected, false);
    assert.equal(state.isCallActive, false);
    assert.equal(state.isPaused, false);
    assert.equal(getAgentPriority(agent), status === 1 ? 5 : 6);
    assert.equal(getAgentCategory(agent), status === 1 ? 'free' : 'offline');
    assert.equal(getAgentDisplayedCall(agent).source, null);
    assert.equal(agent.status, 1);
    assert.equal(agent.npxQueuePresent, true);
    assert.equal(agent.npxSipRegistered, null);
    assert.equal(JSON.stringify(agent), before);
    now += 1000;
  }
});

test('monitor determina livre, ocupado, chamando, pausa e desligado sem gate SIP', t => {
  t.mock.method(Date, 'now', () => operationalNow);
  for (const sip of [null, true, false]) {
    for (const [status, category, priority] of [[0, 'offline', 6], [1, 'free', 5],
      [2, 'busy', 2], [5, 'busy', 2], [-1, 'paused', 3]]) {
      const agent = operationalAgent(status, { status: 0, dst: '85999998888', npxSipRegistered: sip });
      const state = getAgentConnectionState(agent);
      assert.equal(getAgentCategory(agent), category);
      assert.equal(getAgentPriority(agent), priority);
      assert.equal(state.npxSipRegistered, sip);
      assert.equal(state.isRealNpxCall, status === 2);
      assert.equal(state.isNpxBusy, status === 2);
      assert.equal(state.isCallActive, status === 2);
      assert.equal(state.isNpxRinging, status === 5);
      assert.equal(state.isPaused, status === -1);
      assert.equal(state.isNpxSipUnknown, false);
      assert.equal(state.isNpxSipDisconnected, false);
      assert.equal(getAgentDisplayedCall(agent).source, status === 2 ? 'npx' : null);
    }
  }
});

test('monitor status 2 exige telefone externo e mantem numero e direcao da chamada', t => {
  t.mock.method(Date, 'now', () => operationalNow);
  for (const phone of ['', '2002', '44221234', '85999998888']) {
    const agent = operationalAgent(2, { dst: phone, extension: '85999998888' });
    assert.equal(getAgentConnectionState(agent).isRealNpxCall, false);
    assert.equal(getAgentDisplayedCall(agent).source, null);
  }
  for (const outbound of [true, false]) {
    const agent = operationalAgent(2, { [outbound ? 'dst' : 'src']: '85988887777' });
    assert.equal(getAgentConnectionState(agent).npxSipRegistered, null);
    assert.deepEqual(getAgentDisplayedCall(agent), { source: 'npx', number: '85988887777', outbound });
  }
});

test('monitor status 2 sem telefone continua ocupado sem inventar chamada ou numero', t => {
  t.mock.method(Date, 'now', () => operationalNow);
  for (const sip of [null, true, false]) {
    for (const status of [2, '2']) {
      const agent = operationalAgent(status, { npxSipRegistered: sip, src: 'Almoço' });
      const state = getAgentConnectionState(agent);
      assert.equal(state.isNpxBusy, true);
      assert.equal(state.isNpxRinging, false);
      assert.equal(state.isPaused, false);
      assert.equal(state.isRealNpxCall, false);
      assert.equal(state.isCallActive, false);
      assert.equal(state.npxSipRegistered, sip);
      assert.equal(state.connectionSource, 'npx');
      assert.equal(getAgentCategory(agent), 'busy');
      assert.equal(getAgentPriority(agent), 2);
      const displayed = getAgentDisplayedCall(agent);
      assert.equal(displayed.source, null);
      assert.doesNotMatch(displayed.number, /\d/);
      agent.paused = 1;
      assert.equal(getAgentConnectionState(agent).isNpxBusy, false);
      assert.equal(getAgentCategory(agent), 'paused');
    }
  }
});

test('monitor status 5 nao vira pausa por status ou nomes residuais da fila', t => {
  t.mock.method(Date, 'now', () => operationalNow);
  const agent = operationalAgent(5, { status: -1, src: 'Almoço', dst: '85999998888' });
  const state = getAgentConnectionState(agent);
  assert.equal(state.isNpxRinging, true);
  assert.equal(state.isNpxBusy, false);
  assert.equal(state.isPaused, false);
  assert.equal(state.isCallActive, false);
  assert.equal(getAgentCategory(agent), 'busy');
  for (const paused of [1, '1']) {
    const pausedAgent = { ...agent, paused };
    assert.equal(getAgentConnectionState(pausedAgent).isPaused, true);
    assert.equal(getAgentConnectionState(pausedAgent).isNpxRinging, false);
    assert.equal(getAgentConnectionState(pausedAgent).isCallActive, false);
    assert.equal(getAgentCategory(pausedAgent), 'paused');
  }
  const callOnPause = operationalAgent(2, { paused: 1, dst: '85999998888' });
  assert.equal(getAgentConnectionState(callOnPause).isCallActive, true);
  assert.equal(getAgentCategory(callOnPause), 'paused');
  const disconnected = operationalAgent(0, { paused: 1, src: 'Almoço' });
  assert.equal(getAgentConnectionState(disconnected).isPaused, false);
  assert.equal(getAgentCategory(disconnected), 'offline');
});

test('PBX prevalece sobre monitor valido ou invalido preservando SIP no contrato estrito', t => {
  t.mock.method(Date, 'now', () => operationalNow);
  for (const pbxStatus of ['Free', 'Busy']) {
    for (const sip of [null, true, false]) {
      for (const status of [0, 1, 2, 5, -1, 99]) {
        const agent = operationalAgent(status, {
          pbxStatus, npxSipRegistered: sip, paused: 1, src: 'Almoço', dst: '85999998888',
          pbxNumber: '85988887777', pbxDirection: 0
        });
        const state = getAgentConnectionState(agent);
        assert.equal(state.connectionSource, 'pbx');
        assert.equal(state.npxSipRegistered, sip);
        assert.equal(state.isNpxQueueOnline, false);
        assert.equal(state.isNpxQueueDisconnected, false);
        assert.equal(state.isNpxOperationalUnknown, false);
        assert.equal(state.isNpxRinging, false);
        assert.equal(state.isNpxBusy, false);
        assert.equal(state.isRealNpxCall, false);
        assert.equal(state.isPaused, false);
        assert.equal(state.isCallActive, pbxStatus === 'Busy');
        assert.equal(getAgentCategory(agent), pbxStatus === 'Busy' ? 'busy' : 'free');
        assert.equal(getAgentPriority(agent), pbxStatus === 'Busy' ? 1 : 4);
        assert.deepEqual(getAgentDisplayedCall(agent), pbxStatus === 'Busy'
          ? { source: 'pbx', number: '85988887777', outbound: true }
          : { source: null, number: 'Em Ligação', outbound: false });
      }
    }
  }
});

test('monitor exige fila presente mesmo com observacao valida e SIP true', t => {
  t.mock.method(Date, 'now', () => operationalNow);
  for (const npxQueuePresent of [false, undefined, 'true', 1]) {
    const agent = operationalAgent(2, { npxQueuePresent, npxSipRegistered: true, dst: '85999998888' });
    const state = getAgentConnectionState(agent);
    assert.equal(state.hasNpxOperationalStatus, true);
    assert.equal(state.isNpxQueueOnline, false);
    assert.equal(state.isNpxBusy, false);
    assert.equal(state.isCallActive, false);
    assert.equal(state.connectionSource, null);
    assert.equal(getAgentCategory(agent), 'offline');
  }
});

test('monitor aceita status numerico ou string exata e normaliza o retorno', t => {
  t.mock.method(Date, 'now', () => operationalNow);
  for (const status of [0, 1, 2, 5, -1]) {
    const numeric = operationalAgent(status, { dst: '85999998888' });
    const textual = operationalAgent(String(status), { dst: '85999998888' });
    assert.deepEqual(getAgentConnectionState(textual), getAgentConnectionState(numeric));
    assert.equal(getAgentConnectionState(textual).npxOperationalStatus, status);
    assert.equal(getAgentCategory(textual), getAgentCategory(numeric));
  }
});

test('monitor rejeita agente ou fila divergentes sem usar SIP true como fallback', t => {
  t.mock.method(Date, 'now', () => operationalNow);
  const observation = operationalAgent(1).npxOperational;
  const wrongScope = [
    ...['4422003', '2002', 4422002, undefined, null, ' 4422002'].map(agentCode => ({ ...observation, agentCode })),
    ...['InfoBrasil_Comercial', 'infobrasil_suporte', 'InfoBrasil_Suporte ', undefined, null, 1]
      .map(queue => ({ ...observation, queue }))
  ];
  for (const npxOperational of wrongScope) {
    const agent = operationalAgent(1, { npxOperational, npxSipRegistered: true });
    const state = getAgentConnectionState(agent);
    assert.equal(state.isNpxOperationalUnknown, true);
    assert.equal(state.hasNpxOperationalStatus, false);
    assert.equal(state.npxOperationalStatus, null);
    assert.equal(state.npxSipRegistered, true);
    assert.equal(state.isNpxQueueOnline, false);
    assert.equal(state.connectionSource, null);
    assert.equal(getAgentCategory(agent), 'offline');
  }
  for (const overrides of [{ code: '4422003' }, { npxQueue: 'InfoBrasil_Comercial' }, { npxQueue: undefined }]) {
    assert.equal(getAgentConnectionState(operationalAgent(1, overrides)).isNpxOperationalUnknown, true);
  }
  assert.equal(getAgentCategory(operationalAgent(1, { code: 4422002 })), 'free');
});

test('monitor rejeita observacao sem agentCode ou queue mesmo com SIP true', t => {
  t.mock.method(Date, 'now', () => operationalNow);
  for (const fields of [['agentCode'], ['queue'], ['agentCode', 'queue']]) {
    const agent = operationalAgent(1, { npxSipRegistered: true });
    for (const field of fields) delete agent.npxOperational[field];
    const state = getAgentConnectionState(agent);
    assert.equal(state.hasNpxOperationalStatus, false);
    assert.equal(state.npxOperationalStatus, null);
    assert.equal(state.isNpxOperationalUnknown, true);
    assert.equal(state.npxSipRegistered, true);
    assert.equal(state.isNpxQueueOnline, false);
    assert.equal(state.isNpxBusy, false);
    assert.equal(state.isNpxRinging, false);
    assert.equal(state.connectionSource, null);
    assert.equal(getAgentCategory(agent), 'offline');
    assert.equal(getAgentPriority(agent), 6);
  }
});

test('monitor respeita TTL de 30000 ms e tolerancia futura de 5000 ms inclusive nos limites', t => {
  t.mock.method(Date, 'now', () => operationalNow);
  for (const age of [-5001, -5000, -1, 0, 29999, 30000, 30001]) {
    const valid = age >= -5000 && age <= 30000;
    const agent = operationalAgent(1, { npxSipRegistered: true });
    agent.npxOperational.observedAt = new Date(operationalNow - age).toISOString();
    const state = getAgentConnectionState(agent);
    assert.equal(state.hasNpxOperationalStatus, valid, `age=${age}`);
    assert.equal(state.npxOperationalStatus, valid ? 1 : null);
    assert.equal(state.isNpxOperationalUnknown, !valid);
    assert.equal(state.npxSipRegistered, true);
    assert.equal(state.isNpxQueueOnline, valid);
    assert.equal(state.connectionSource, valid ? 'npx' : null);
    assert.equal(getAgentCategory(agent), valid ? 'free' : 'offline');
  }
});

test('a mesma observacao expira sem reaproveitar SIP true e volta apos novo GET', t => {
  let now = operationalNow;
  t.mock.method(Date, 'now', () => now);
  const agent = operationalAgent(1, { npxSipRegistered: true });
  assert.equal(getAgentCategory(agent), 'free');
  now += 30001;
  assert.equal(getAgentCategory(agent), 'offline');
  assert.equal(getAgentConnectionState(agent).isNpxOperationalUnknown, true);
  agent.npxOperational.observedAt = new Date(now).toISOString();
  assert.equal(getAgentCategory(agent), 'free');
  assert.equal(getAgentConnectionState(agent).isNpxOperationalUnknown, false);
});

test('monitor invalido nao faz fallback a SIP, chamada, pausa ou status 0 residuais', t => {
  t.mock.method(Date, 'now', () => operationalNow);
  const valid = operationalAgent(1).npxOperational;
  const invalid = [null, undefined, false, 1, 'online', [], {},
    ...['01', ' 1', '1 ', '1.0', '2x', '', {}, [], true, null, undefined, NaN, Infinity, 3, -2]
      .map(status => ({ ...valid, status })),
    ...[undefined, 'portal', 'NPX-QUEUE-MONITOR'].map(source => ({ ...valid, source })),
    ...[undefined, null, operationalNow, '', 'invalid', '2026-10-18', '2026-10-18T12:00:00',
      '2026-02-30T12:00:00Z', '2026-10-18T24:00:00Z', '2026-10-18T12:60:00Z',
      '2026-10-18T12:00:00+99:00'].map(observedAt => ({ ...valid, observedAt }))];
  for (const npxOperational of invalid) {
    for (const status of [0, 1, 2, 5, -1]) {
      const agent = operationalAgent(1, { npxOperational, status, npxSipRegistered: true,
        paused: 1, src: 'Almoço', dst: '85999998888' });
      const state = getAgentConnectionState(agent);
      assert.equal(state.npxOperationalStatus, null);
      assert.equal(state.hasNpxOperationalStatus, false);
      assert.equal(state.isNpxOperationalUnknown, true);
      assert.equal(state.isNpxQueueOnline, false);
      assert.equal(state.isNpxQueueDisconnected, false);
      assert.equal(state.isPaused, false);
      assert.equal(state.isNpxRinging, false);
      assert.equal(state.isNpxBusy, false);
      assert.equal(state.isCallActive, false);
      assert.equal(state.npxSipRegistered, true);
      assert.equal(state.connectionSource, null);
      assert.equal(getAgentPriority(agent), 6);
      assert.equal(getAgentCategory(agent), 'offline');
      assert.equal(getAgentDisplayedCall(agent).source, null);
    }
  }
});

test('monitor aceita ISO UTC ou com offset que represente observacao atual', t => {
  t.mock.method(Date, 'now', () => operationalNow);
  for (const observedAt of ['2026-10-18T12:00:00Z', '2026-10-18T12:00:00.000Z',
    '2026-10-18T09:00:00-03:00', '2026-10-18T14:00:00+02:00']) {
    const agent = operationalAgent(1);
    agent.npxOperational.observedAt = observedAt;
    assert.equal(getAgentCategory(agent), 'free');
  }
});

test('ausencia do campo preserva modo estrito anterior e atencao SIP desconhecido', t => {
  t.mock.method(Date, 'now', () => operationalNow);
  for (const sip of [null, true, false]) {
    const agent = operationalAgent(1, { npxSipRegistered: sip });
    delete agent.npxOperational;
    const state = getAgentConnectionState(agent);
    assert.equal(state.hasNpxOperationalStatus, false);
    assert.equal(state.npxOperationalStatus, null);
    assert.equal(state.isNpxOperationalUnknown, false);
    assert.equal(state.isNpxSipUnknown, sip === null);
    assert.equal(state.isNpxSipDisconnected, sip === false);
    assert.equal(getAgentCategory(agent), sip === true ? 'free' : 'offline');
    agent.status = 0;
    assert.equal(getAgentConnectionState(agent).isNpxQueueDisconnected, true);
    assert.equal(getAgentCategory(agent), 'offline');
    agent.status = 5;
    assert.equal(getAgentCategory(agent), sip === true ? 'paused' : 'offline');
  }
});

test('fora do modo estrito o novo objeto nao altera comportamento legado', t => {
  t.mock.method(Date, 'now', () => operationalNow);
  for (const npxOperational of [operationalAgent(0).npxOperational, null, {}]) {
    const agent = operationalAgent(1, { npxOperational, npxRequireSipConfirmation: false });
    assert.equal(getAgentCategory(agent), 'free');
    assert.equal(getAgentConnectionState(agent).hasNpxOperationalStatus, false);
    assert.equal(getAgentConnectionState(agent).isNpxBusy, false);
    agent.status = 5;
    assert.equal(getAgentCategory(agent), 'paused');
    agent.status = 2;
    agent.dst = '85999998888';
    assert.equal(getAgentConnectionState(agent).npxSipRegistered, true);
    agent.pbxStatus = 'Free';
    assert.equal(getAgentConnectionState(agent).npxSipRegistered, false);
    assert.equal(getAgentCategory(agent), 'free');
  }
});

test('contrato operacional tem paridade Node e VM do navegador em todos os estados e no PBX', t => {
  t.mock.method(Date, 'now', () => operationalNow);
  const script = fs.readFileSync(path.join(__dirname, '../public/agent-state.js'), 'utf8');
  const browser = { Date };
  vm.runInNewContext(script, browser);
  for (const status of [0, 1, 2, 5, -1, 99]) {
    for (const pbxStatus of ['Offline', 'Free', 'Busy']) {
      const agent = operationalAgent(status, { pbxStatus, dst: '85999998888' });
      assert.deepEqual(JSON.parse(JSON.stringify(browser.InfoBoardAgentState.getAgentConnectionState(agent))),
        getAgentConnectionState(agent));
      assert.equal(browser.InfoBoardAgentState.getAgentCategory(agent), getAgentCategory(agent));
      assert.equal(browser.InfoBoardAgentState.getAgentPriority(agent), getAgentPriority(agent));
      assert.deepEqual(JSON.parse(JSON.stringify(browser.InfoBoardAgentState.getAgentDisplayedCall(agent))),
        getAgentDisplayedCall(agent));
    }
  }
});
