const cheerio = require('cheerio');

// As páginas da SVRS mostram somente a hora de cada consulta, sem a data.
// Não considerar uma resposta antiga como evidência de disponibilidade atual.
const MAX_SOURCE_AGE_MS = 20 * 60 * 1000;

function statusFromSignals(signals) {
  if (signals.includes('DANGER')) return 'DANGER';
  if (signals.includes('WARNING')) return 'WARNING';
  // A primeira verificação é a autorização (ou recepção síncrona no CT-e).
  // Um WS Status normal não confirma sozinho que notas podem ser autorizadas.
  // Leituras antigas ou ausentes não são prova de indisponibilidade.
  if (signals[0] === 'OK') return 'OK';
  return 'UNKNOWN';
}

function getClockAge(text, now) {
  const match = String(text).match(/\b(\d{2}):(\d{2}):(\d{2})\b/);
  if (!match) return Infinity;
  const checked = new Date(now);
  checked.setHours(Number(match[1]), Number(match[2]), Number(match[3]), 0);
  // Consulta perto da meia-noite: a última leitura pode ser do dia anterior.
  if (checked.getTime() - now.getTime() > 12 * 60 * 60 * 1000) {
    checked.setDate(checked.getDate() - 1);
  }
  const age = now.getTime() - checked.getTime();
  return age >= -2 * 60 * 1000 ? age : Infinity;
}

function readSvrsService($, table, servicePattern, now) {
  const row = $(table).find('tr').filter((_, el) => servicePattern.test($(el).find('b').text().trim())).first();
  if (!row.length) return { status: 'UNKNOWN', checkedAt: null, stale: false };

  const result = row.find('small').text().replace(/\s+/g, ' ').trim();
  const checkedAt = result.match(/\b\d{2}:\d{2}:\d{2}\b/)?.[0] || null;
  const stale = getClockAge(result, now) > MAX_SOURCE_AGE_MS;
  if (stale) return { status: 'UNKNOWN', checkedAt, stale: Boolean(checkedAt) };

  const icon = row.find('i').attr('class') || '';
  // O horário do portal é separado do horário do polling do InfoBoard.
  if (/fa-check-circle/.test(icon) && /WS com status normal/i.test(result)) return { status: 'OK', checkedAt, stale: false };
  if (/fa-times|fa-ban|fa-exclamation-circle/.test(icon) || /falha|indispon[ií]vel|status anormal/i.test(result)) return { status: 'DANGER', checkedAt, stale: false };
  if (/fa-exclamation|fa-warning/.test(icon) || /inst[aá]vel|alerta/i.test(result)) return { status: 'WARNING', checkedAt, stale: false };
  return { status: 'UNKNOWN', checkedAt, stale: false };
}

function parseSvrsAvailability(html, documentType, now = new Date()) {
  const $ = cheerio.load(html);
  const tables = $('table.table-hover');
  const virtual = documentType !== 'mdfe';
  const table = virtual ? tables.eq(1) : tables.eq(0);
  if (!table.length || (virtual && (!$('h4').toArray().some(h => /SEFAZ Virtual do RS/i.test($(h).text())) || tables.length < 2))) {
    return { status: 'UNKNOWN', detail: 'Quadro de disponibilidade da SVRS não encontrado' };
  }

  const authorization = readSvrsService($, table, /WS Autorizac[aã]o/i, now);
  const serviceChecks = { authorization };
  const checks = [authorization.status];
  // O portal da NFC-e identifica seu WS Status como HMLE (homologação).
  // A disponibilidade de produção é verificada pela autorização.
  if (documentType !== 'nfce') {
    serviceChecks.serviceStatus = readSvrsService($, table, /WS Status\b/i, now);
    checks.push(serviceChecks.serviceStatus.status);
  }

  const status = statusFromSignals(checks);
  const hasUnconfirmedService = checks.includes('UNKNOWN');
  const detail = status === 'OK' ? 'Serviços consultados normais no portal oficial da SVRS'
    : status === 'UNKNOWN' ? 'Sem confirmação recente da autorização fiscal no portal oficial da SVRS'
    : status === 'WARNING' ? 'Portal oficial indica instabilidade no serviço'
    : 'Portal oficial indica falha no serviço';
  const confirmedDetail = status === 'OK' && hasUnconfirmedService
    ? 'Serviço disponível segundo a verificação recente da SVRS; outra verificação está ausente ou desatualizada'
    : detail;
  return { status, detail: confirmedDetail, serviceChecks };
}

function parseCteAvailability(html, now = new Date()) {
  const $ = cheerio.load(html);
  const caption = $('table.tabelaListagemDados caption').text();
  const match = caption.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return { status: 'UNKNOWN', detail: 'Data da consulta oficial CT-e indisponível' };

  const [, day, month, year, hour, minute, second] = match;
  const sourceTime = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const age = now.getTime() - sourceTime.getTime();
  if (age < -2 * 60 * 1000 || age > MAX_SOURCE_AGE_MS) {
    return { status: 'UNKNOWN', detail: 'Consulta oficial CT-e sem atualização recente' };
  }

  const row = $('table.tabelaListagemDados tr').filter((_, el) => $(el).find('td').first().text().trim() === 'SVRS').first();
  if (!row.length) return { status: 'UNKNOWN', detail: 'Autorizador SVRS não encontrado no portal CT-e' };

  const cells = row.find('td');
  // Colunas oficiais: 1 Recepção Sinc, 2 Status Serviço.
  const checks = [1, 2].map(index => {
    const image = (cells.eq(index).find('img').attr('src') || '').toLowerCase();
    if (/bola_verde/.test(image)) return 'OK';
    if (/bola_amarel/.test(image)) return 'WARNING';
    if (/bola_vermelh/.test(image)) return 'DANGER';
    return 'UNKNOWN';
  });
  const status = statusFromSignals(checks);
  const detail = status === 'OK' && checks.includes('UNKNOWN') ? 'Recepção do CT-e normal; outro indicador oficial sem confirmação'
    : status === 'OK' ? 'Recepção e status do CT-e normais no portal oficial'
    : status === 'UNKNOWN' ? 'Indicadores oficiais do CT-e incompletos'
    : status === 'WARNING' ? 'Portal oficial indica instabilidade no CT-e'
    : 'Portal oficial indica falha no CT-e';
  return { status, detail };
}

module.exports = { parseSvrsAvailability, parseCteAvailability };
