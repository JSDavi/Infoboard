const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSvrsAvailability, parseCteAvailability } = require('../sefaz-status');

const now = new Date(2026, 9, 11, 19, 50, 0);

function svrsRow(name, time = '19:49:00', icon = 'fa-check-circle', result = 'WS com status normal') {
  return `<tr><td><b>${name}</b></td><td><i class="fa ${icon}"></i><small>${time} - ${result} (CStat: 107)</small></td></tr>`;
}

function svrsTable(rows) {
  return `<table class="table table-hover"><tbody>${rows.join('')}</tbody></table>`;
}

function svrsPage(rows, documentType) {
  const target = svrsTable(rows);
  return documentType === 'mdfe' ? target :
    `<h4>SEFAZ-RS</h4>${svrsTable([svrsRow('WS Autorizacao')])}` +
    `<h4>SEFAZ Virtual do RS</h4>${target}`;
}

function ctePage(checkedAt, reception = 'verde', service = 'verde') {
  return `<table class="tabelaListagemDados"><caption>Visão Geral - Última Verificação: ${checkedAt}</caption>` +
    `<tr><td>SVRS</td><td><img src="imagens/bola_${reception}_P.png"></td>` +
    `<td><img src="imagens/bola_${service}_P.png"></td></tr></table>`;
}

test('NF-e usa SVRS e exige autorização recente para mostrar ONLINE', () => {
  const ok = svrsPage([svrsRow('WS Autorizacao (URL)'), svrsRow('WS Status (URL)')], 'nfe');
  const bothFresh = parseSvrsAvailability(ok, 'nfe', now);
  assert.equal(bothFresh.status, 'OK');
  assert.deepEqual(bothFresh.serviceChecks, {
    authorization: { status: 'OK', checkedAt: '19:49:00', stale: false },
    serviceStatus: { status: 'OK', checkedAt: '19:49:00', stale: false }
  });

  const stale = svrsPage([
    svrsRow('WS Autorizacao (URL)', '09:18:57'), svrsRow('WS Status (URL)')
  ], 'nfe');
  const partial = parseSvrsAvailability(stale, 'nfe', now);
  assert.equal(partial.status, 'UNKNOWN');
  assert.match(partial.detail, /Sem confirmação recente da autorização/);
  assert.deepEqual(partial.serviceChecks, {
    authorization: { status: 'UNKNOWN', checkedAt: '09:18:57', stale: true },
    serviceStatus: { status: 'OK', checkedAt: '19:49:00', stale: false }
  });
});

test('NF-e mantém o horário e distingue serviço ausente de serviço desatualizado', () => {
  const missing = svrsPage([svrsRow('WS Autorizacao (URL)')], 'nfe');
  const data = parseSvrsAvailability(missing, 'nfe', now);
  assert.equal(data.status, 'OK');
  assert.deepEqual(data.serviceChecks.serviceStatus, { status: 'UNKNOWN', checkedAt: null, stale: false });

  const noAuthorization = svrsPage([svrsRow('WS Status (URL)')], 'nfe');
  assert.equal(parseSvrsAvailability(noAuthorization, 'nfe', now).status, 'UNKNOWN');

  const failed = svrsPage([
    svrsRow('WS Autorizacao (URL)', '19:49:00', 'fa-times-circle', 'Serviço indisponível'),
    svrsRow('WS Status (URL)')
  ], 'nfe');
  assert.equal(parseSvrsAvailability(failed, 'nfe', now).serviceChecks.authorization.status, 'DANGER');
  assert.equal(parseSvrsAvailability(failed, 'nfe', now).status, 'DANGER');
});

test('NF-e fica sem confirmação se nenhuma verificação for recente', () => {
  const html = svrsPage([
    svrsRow('WS Autorizacao', '09:18:57'),
    svrsRow('WS Status', '09:19:00')
  ], 'nfe');
  assert.equal(parseSvrsAvailability(html, 'nfe', now).status, 'UNKNOWN');
});

test('NF-e indica OSCILANDO se o portal sinaliza instabilidade recente', () => {
  const html = svrsPage([
    svrsRow('WS Autorizacao', '09:18:57'),
    svrsRow('WS Status', '19:49:00', 'fa-warning', 'Serviço instável')
  ], 'nfe');
  assert.equal(parseSvrsAvailability(html, 'nfe', now).status, 'WARNING');
});

test('NFC-e verifica autorização de produção, sem exigir WS de homologação', () => {
  const html = svrsPage([svrsRow('WS Autorizacao (URL)'),
    svrsRow('WS Status (URL) - HMLE', '09:00:00')], 'nfce');
  assert.equal(parseSvrsAvailability(html, 'nfce', now).status, 'OK');
  assert.equal(parseSvrsAvailability(svrsPage([
    svrsRow('WS Autorizacao (URL)', '09:00:00'),
    svrsRow('WS Status (URL) - HMLE')
  ], 'nfce'), 'nfce', now).status, 'UNKNOWN');
});

test('MDF-e avalia autorização e status na sua tabela própria', () => {
  const ok = svrsPage([
    svrsRow('WS Autorizacao Sincrono'), svrsRow('WS Status')
  ], 'mdfe');
  assert.equal(parseSvrsAvailability(ok, 'mdfe', now).status, 'OK');

  const staleAuthorization = svrsPage([
    svrsRow('WS Autorizacao Sincrono', '09:00:00'), svrsRow('WS Status')
  ], 'mdfe');
  assert.equal(parseSvrsAvailability(staleAuthorization, 'mdfe', now).status, 'UNKNOWN');

  const failing = svrsPage([
    svrsRow('WS Autorizacao Sincrono', '19:49:00', 'fa-times-circle', 'Serviço indisponível'),
    svrsRow('WS Status')
  ], 'mdfe');
  assert.equal(parseSvrsAvailability(failing, 'mdfe', now).status, 'DANGER');
});

test('Falhas de leitura ou alertas nunca viram tudo OK', () => {
  assert.equal(parseSvrsAvailability('<div>erro</div>', 'nfe', now).status, 'UNKNOWN');
  const warning = svrsPage([
    svrsRow('WS Autorizacao (URL)', '19:49:00', 'fa-warning', 'Serviço instável'),
    svrsRow('WS Status (URL)')
  ], 'nfe');
  assert.equal(parseSvrsAvailability(warning, 'nfe', now).status, 'WARNING');
});

test('Ícone de falha tem prioridade sobre indicação de alerta', () => {
  const html = svrsPage([
    svrsRow('WS Autorizacao', '19:49:00', 'fa-exclamation-circle', 'Serviço indisponível'),
    svrsRow('WS Status')
  ], 'nfe');
  assert.equal(parseSvrsAvailability(html, 'nfe', now).status, 'DANGER');
});

test('CT-e usa a linha SVRS, verifica serviços e frescor do portal', () => {
  assert.equal(parseCteAvailability(ctePage('11/10/2026 19:49:00'), now).status, 'OK');
  assert.equal(parseCteAvailability(ctePage('11/10/2026 19:49:00', 'amarela'), now).status, 'WARNING');
  assert.equal(parseCteAvailability(ctePage('11/10/2026 19:49:00', 'vermelha'), now).status, 'DANGER');
  assert.equal(parseCteAvailability(ctePage('11/10/2026 19:49:00', 'ausente', 'verde'), now).status, 'UNKNOWN');
  assert.equal(parseCteAvailability(ctePage('11/10/2026 19:49:00', 'verde', 'ausente'), now).status, 'OK');
  assert.equal(parseCteAvailability(ctePage('11/10/2026 18:00:00'), now).status, 'UNKNOWN');
  assert.equal(parseCteAvailability('<html></html>', now).status, 'UNKNOWN');
});

test('NF-e aceita consulta pouco antes da meia-noite do dia anterior', () => {
  const midnight = new Date(2026, 9, 12, 0, 3, 0);
  const html = svrsPage([
    svrsRow('WS Autorizacao', '23:59:00'), svrsRow('WS Status', '23:59:00')
  ], 'nfe');
  const data = parseSvrsAvailability(html, 'nfe', midnight);
  assert.equal(data.status, 'OK');
  assert.equal(data.serviceChecks.authorization.checkedAt, '23:59:00');
  assert.equal(data.serviceChecks.authorization.stale, false);
});
