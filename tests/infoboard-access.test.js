const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeIp, isTvRequest, isInternalViewer, getPanelAccess, filterPanelData } = require('../infoboard-access');

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

test('modo restrito exige IP explicito e modo LAN preserva rede privada', () => {
  for (const ip of ['10.24.3.10', '172.16.0.1', '172.31.255.254', '192.168.1.25']) {
    assert.equal(isInternalViewer(req(ip), '', false), false, ip);
    assert.equal(getPanelAccess(req(ip), { INFOBOARD_ALLOW_PRIVATE_NETWORK: 'false' }), null);
    assert.deepEqual(getPanelAccess(req(ip), {}), { mode: 'viewer' });
    assert.equal(isInternalViewer(req(ip), '', true), true, ip);
    assert.deepEqual(getPanelAccess(req(ip), { INFOBOARD_ALLOW_PRIVATE_NETWORK: 'true' }), { mode: 'viewer' });
  }
  for (const ip of ['8.8.8.8', '172.32.1.2', '169.254.1.2']) {
    assert.equal(isInternalViewer(req(ip)), false, ip);
    assert.equal(getPanelAccess(req(ip), {}), null);
    assert.equal(isInternalViewer(req(ip), '', true), false, ip);
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

test('computador autorizado recebe observacao sem abrir acesso para o restante da LAN', () => {
  const remote = req('192.168.20.15');
  const config = { INFOBOARD_VIEWER_ALLOWED_IPS: '192.168.20.15', INFOBOARD_ALLOW_PRIVATE_NETWORK: 'false' };
  assert.deepEqual(getPanelAccess(remote, config), { mode: 'viewer' });
  assert.equal(getPanelAccess(req('192.168.20.16'), config), null);
  assert.deepEqual(getPanelAccess(remote, { INFOBOARD_TV_ALLOWED_IPS: '192.168.20.15' }), { mode: 'tv' });
  for (const value of ['false', 'TRUE', '1', 'invalid', '']) {
    assert.equal(getPanelAccess(remote, { INFOBOARD_ALLOW_PRIVATE_NETWORK: value }), null);
  }
});

test('IPs equivalentes IPv6 e IPv4 mapeados usam a mesma allowlist', () => {
  assert.equal(normalizeIp('0:0:0:0:0:0:0:1'), '::1');
  assert.equal(normalizeIp('::FFFF:192.168.20.15'), '192.168.20.15');
  assert.equal(normalizeIp('0:0:0:0:0:ffff:c0a8:140f'), '192.168.20.15');
  assert.equal(normalizeIp('not-an-ip'), null);
  assert.equal(normalizeIp('fe80::1%eth0'), null);
  assert.deepEqual(getPanelAccess(req('2001:db8::1'), {
    INFOBOARD_VIEWER_ALLOWED_IPS: '2001:0DB8:0:0:0:0:0:1'
  }), { mode: 'viewer' });
});

test('cabecalhos de proxy vazios ou em caixa mista tambem negam acesso', () => {
  for (const key of ['Forwarded', 'X-Forwarded-For', 'X-Real-IP', 'X-Client-IP', 'CF-Connecting-IP']) {
    assert.equal(getPanelAccess(req('127.0.0.1', { [key]: '' }), {}), null, key);
    assert.equal(isInternalViewer(req('192.168.20.15', { [key]: '' }), '192.168.20.15', true), false, key);
  }
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
