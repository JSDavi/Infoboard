const test = require('node:test');
const assert = require('node:assert/strict');
const { isTvRequest, isInternalViewer, getPanelAccess, filterPanelData } = require('../infoboard-access');

const departments = {
  InfoBrasil_Suporte: { name: 'Suporte' },
  Infobrasil_finan: { name: 'Financeiro' }
};

const req = (ip, headers = {}) => ({ socket: { remoteAddress: ip }, headers });

test('TV recebe acesso completo apenas pelo IP direto confiável', () => {
  assert.equal(isTvRequest(req('127.0.0.1')), true);
  assert.equal(isTvRequest(req('::1')), true);
  assert.equal(isTvRequest(req('::ffff:192.168.1.25'), '192.168.1.25'), true);
  assert.equal(isTvRequest(req('192.168.1.26'), '192.168.1.25'), false);
  assert.equal(isTvRequest(req('192.168.1.25'), 'valor-invalido'), false);
});

test('cabeçalhos de proxy nunca concedem perfil TV por IP', () => {
  for (const key of ['forwarded', 'x-forwarded-for', 'x-real-ip', 'x-client-ip', 'cf-connecting-ip']) {
    assert.equal(isTvRequest(req('127.0.0.1', { [key]: '192.168.1.25' })), false, key);
  }
});

test('rede interna visualiza os dados sem login e rede externa não recebe acesso livre', () => {
  for (const ip of ['10.24.3.10', '172.16.0.1', '172.31.255.254', '192.168.1.25']) {
    assert.equal(isInternalViewer(req(ip)), true, ip);
    assert.deepEqual(getPanelAccess(req(ip)), { mode: 'viewer' });
  }
  for (const ip of ['8.8.8.8', '172.32.1.2', '169.254.1.2']) {
    assert.equal(isInternalViewer(req(ip)), false, ip);
    assert.equal(getPanelAccess(req(ip)), null);
  }
  assert.equal(isInternalViewer(req('10.24.3.10', { 'x-forwarded-for': '10.24.3.10' })), false);
  assert.equal(isInternalViewer(req('127.0.0.1', { forwarded: 'for=192.168.1.1' })), false);
  assert.equal(isInternalViewer(req('203.0.113.10'), '203.0.113.10'), true);
});

test('rede externa não obtém acesso mesmo que envie cookies ou cabeçalhos de sessão', () => {
  assert.equal(getPanelAccess(req('203.0.113.11', { cookie: 'npx_session=falso' })), null);
  assert.equal(getPanelAccess(req('203.0.113.11', { authorization: 'Bearer falso' })), null);
  assert.deepEqual(getPanelAccess(req('127.0.0.1')), { mode: 'tv' });
});

test('rede privada mantém acesso de observação mesmo sem cookies', () => {
  const remote = req('192.168.20.15');
  assert.deepEqual(getPanelAccess(remote), { mode: 'viewer' });
});

test('resposta de leitura preserva dados observados de todas as filas e integrações', () => {
  const payload = {
    timestamp: '2026-10-17T10:00:00-03:00',
    status: { npx: { authenticated: true }, pbx: { authenticated: true }, prix: { authenticated: true } },
    departments: {
      InfoBrasil_Suporte: { queue: 2, wait_time_sec: 35, agents: [{ name: 'Autorizado' }], calls: [] },
      Infobrasil_finan: { queue: 99, agents: [{ name: 'Outro setor - sigiloso' }], calls: [{ client: 'Cliente sigiloso' }] }
    },
    prixchat: { pending: [{ name: 'Chat sigiloso' }], agents: [{ name: 'Agente sigiloso' }] },
    sefaz: { nfe: { status: 'OK' } },
    horarios: { internal: 'não autorizado' },
    hospedagens: { records: ['não autorizado'] }
  };
  const filtered = filterPanelData(payload, { mode: 'viewer' });
  assert.equal(filtered.departments.InfoBrasil_Suporte.queue, 2);
  assert.deepEqual(filtered.departments.InfoBrasil_Suporte.agents, [{ name: 'Autorizado' }]);
  assert.equal(filtered.departments.Infobrasil_finan.queue, 99);
  assert.equal(filtered.departments.Infobrasil_finan.agents.length, 1);
  assert.deepEqual(filtered.prixchat, payload.prixchat);
  assert.deepEqual(filtered.horarios, payload.horarios);
  assert.deepEqual(filtered.hospedagens, payload.hospedagens);
  assert.deepEqual(filtered.access, { mode: 'viewer' });
  assert.deepEqual(filterPanelData(payload, { mode: 'tv' }, departments).departments, payload.departments);
});
