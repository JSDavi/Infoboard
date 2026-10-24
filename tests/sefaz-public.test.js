const test = require('node:test');
const assert = require('node:assert/strict');
const {
  INTEGRANOTAS_BASE_URL,
  INTEGRANOTAS_PROVIDER,
  INTEGRANOTAS_URLS,
  INTEGRANOTAS_HEADERS,
  INTEGRANOTAS_COLORS,
  DEFAULT_UF,
  DOCUMENT_TYPES,
  getIntegraNotasUrl,
  validateIntegraNotasPayload,
  mapIntegraNotasStatus,
  parseIntegraNotasMonitor,
  fetchPublicSefazDocumentStatus,
  fetchPublicSefazStatuses
} = require('../sefaz-public');

function buildMonitorPayload({
  labels = ['AC', 'BA', 'CE', 'SP'],
  data = [100, 100, 100, 100],
  backgroundColor = [
    INTEGRANOTAS_COLORS.GREEN,
    INTEGRANOTAS_COLORS.GREEN,
    INTEGRANOTAS_COLORS.GREEN,
    INTEGRANOTAS_COLORS.GREEN
  ],
  normal = [1, 1, 1, 1],
  svc = [0, 0, 0, 0]
} = {}) {
  return {
    dados: {
      labels,
      data,
      backgroundColor,
      normal,
      svc
    }
  };
}

function buildCePayload({
  color = INTEGRANOTAS_COLORS.GREEN,
  normal = 1,
  svc = 0,
  metric = 100
} = {}) {
  return buildMonitorPayload({
    labels: ['SP', 'CE', 'RS'],
    data: [100, metric, 100],
    backgroundColor: [INTEGRANOTAS_COLORS.GREEN, color, INTEGRANOTAS_COLORS.GREEN],
    normal: [1, normal, 1],
    svc: [0, svc, 0]
  });
}

test('Configuração da fonte IntegraNotas define os 4 documentos fiscais e UF CE sem Webmania', () => {
  assert.equal(DEFAULT_UF, 'CE');
  assert.equal(INTEGRANOTAS_PROVIDER, 'IntegraNotas');
  assert.deepEqual(DOCUMENT_TYPES, ['nfe', 'nfce', 'cte', 'mdfe']);
  assert.equal(getIntegraNotasUrl('nfe'), 'https://integranotas.com.br/doc/sefaz/monitor/nfe');
  assert.equal(getIntegraNotasUrl('nfce'), 'https://integranotas.com.br/doc/sefaz/monitor/nfce');
  assert.equal(getIntegraNotasUrl('cte'), 'https://integranotas.com.br/doc/sefaz/monitor/cte');
  assert.equal(getIntegraNotasUrl('mdfe'), 'https://integranotas.com.br/doc/sefaz/monitor/mdfe');
  assert.equal(getIntegraNotasUrl('invalido'), null);
});

test('Mapeia OK somente quando normal===1 e cor verde rgb(46, 202, 139)', () => {
  const okPayload = buildCePayload({
    normal: 1,
    svc: 0,
    color: 'rgb(46, 202, 139)'
  });
  const parsed = parseIntegraNotasMonitor(okPayload, 'nfe');
  assert.equal(parsed.status, 'OK');
  assert.equal(parsed.uf, 'CE');
  assert.equal(parsed.component, 'CE');
  assert.equal(parsed.provider, 'IntegraNotas');
  assert.equal(parsed.source, INTEGRANOTAS_URLS.nfe);
  assert.equal(parsed.latency, null);
  assert.match(parsed.detail, /IntegraNotas \(CE\): operação normal/);

  // Variação de espaçamento no RGB verde ainda deve ser reconhecida
  assert.equal(
    mapIntegraNotasStatus({ normal: 1, svc: 0, backgroundColor: 'rgb(46,202,139)' }),
    'OK'
  );

  // Cor desconhecida mesmo com normal===1 NÃO deve mapear para OK
  const unknownColorPayload = buildCePayload({
    normal: 1,
    svc: 0,
    color: 'rgb(10, 20, 30)'
  });
  assert.equal(parseIntegraNotasMonitor(unknownColorPayload, 'nfe').status, 'UNKNOWN');
});

test('Mapeia WARNING para amarelo, laranja ou normal===0 com svc===1 (contingência)', () => {
  const yellowPayload = buildCePayload({
    normal: 1,
    svc: 0,
    color: 'rgb(255, 199, 0)'
  });
  const yellowParsed = parseIntegraNotasMonitor(yellowPayload, 'nfce');
  assert.equal(yellowParsed.status, 'WARNING');
  assert.match(yellowParsed.detail, /instabilidade ou alerta/);

  const orangePayload = buildCePayload({
    normal: 1,
    svc: 0,
    color: 'rgb(241, 116, 37)'
  });
  const orangeParsed = parseIntegraNotasMonitor(orangePayload, 'cte');
  assert.equal(orangeParsed.status, 'WARNING');
  assert.match(orangeParsed.detail, /instabilidade ou alerta/);

  const contingencyPayload = buildCePayload({
    normal: 0,
    svc: 1,
    color: 'rgb(46, 202, 139)'
  });
  const contingencyParsed = parseIntegraNotasMonitor(contingencyPayload, 'mdfe');
  assert.equal(contingencyParsed.status, 'WARNING');
  assert.match(contingencyParsed.detail, /contingência/i);
});

test('Mapeia DANGER para vermelho rgb(228, 63, 82) ou normal===0 com svc!==1', () => {
  const redPayload = buildCePayload({
    normal: 1,
    svc: 0,
    color: 'rgb(228, 63, 82)'
  });
  const redParsed = parseIntegraNotasMonitor(redPayload, 'nfe');
  assert.equal(redParsed.status, 'DANGER');
  assert.match(redParsed.detail, /indisponibilidade/);

  const downNoSvcPayload = buildCePayload({
    normal: 0,
    svc: 0,
    color: 'rgb(46, 202, 139)'
  });
  const downNoSvcParsed = parseIntegraNotasMonitor(downNoSvcPayload, 'cte');
  assert.equal(downNoSvcParsed.status, 'DANGER');
  assert.match(downNoSvcParsed.detail, /indisponibilidade/);
});

test('Mapeia UNKNOWN quando a UF CE está ausente ou duplicada nos rótulos', () => {
  const withoutCe = buildMonitorPayload({
    labels: ['AC', 'AL', 'SP', 'RS'],
    data: [100, 100, 100, 100],
    backgroundColor: [
      INTEGRANOTAS_COLORS.GREEN,
      INTEGRANOTAS_COLORS.GREEN,
      INTEGRANOTAS_COLORS.GREEN,
      INTEGRANOTAS_COLORS.GREEN
    ],
    normal: [1, 1, 1, 1],
    svc: [0, 0, 0, 0]
  });
  const parsedMissing = parseIntegraNotasMonitor(withoutCe, 'nfe');
  assert.equal(parsedMissing.status, 'UNKNOWN');
  assert.match(parsedMissing.detail, /UF CE não identificada/);
  assert.equal(parsedMissing.latency, null);

  const duplicateCe = buildMonitorPayload({
    labels: ['CE', 'CE'],
    data: [100, 100],
    backgroundColor: [INTEGRANOTAS_COLORS.GREEN, INTEGRANOTAS_COLORS.GREEN],
    normal: [1, 1],
    svc: [0, 0]
  });
  const parsedDuplicate = parseIntegraNotasMonitor(duplicateCe, 'nfe');
  assert.equal(parsedDuplicate.status, 'UNKNOWN');
});

test('Valida JSON rigorosamente e retorna UNKNOWN para payloads inválidos ou HTML 200', () => {
  const invalidPayloads = [
    null,
    undefined,
    '',
    '<!DOCTYPE html><html><body>Página HTML retornada sem X-Requested-With</body></html>',
    '{"dados":{}}',
    [],
    {},
    { dados: null },
    { dados: [] },
    { dados: { labels: ['CE'] } },
    {
      dados: {
        labels: ['CE'],
        data: '100',
        backgroundColor: [INTEGRANOTAS_COLORS.GREEN],
        normal: [1],
        svc: [0]
      }
    },
    {
      dados: {
        labels: ['CE'],
        data: [100],
        backgroundColor: [],
        normal: [1],
        svc: [0]
      }
    },
    {
      dados: {
        labels: ['CE'],
        data: [100],
        backgroundColor: ['cor-invalida'],
        normal: [1],
        svc: [0]
      }
    },
    {
      dados: {
        labels: ['CE'],
        data: [100],
        backgroundColor: [INTEGRANOTAS_COLORS.GREEN],
        normal: ['1'],
        svc: [0]
      }
    },
    {
      dados: {
        labels: ['CE'],
        data: [100],
        backgroundColor: [INTEGRANOTAS_COLORS.GREEN],
        normal: [1],
        svc: [null]
      }
    },
    {
      dados: {
        labels: ['CE'],
        data: [NaN],
        backgroundColor: [INTEGRANOTAS_COLORS.GREEN],
        normal: [1],
        svc: [0]
      }
    }
  ];

  for (const invalid of invalidPayloads) {
    const result = parseIntegraNotasMonitor(invalid, 'nfe');
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.latency, null);
  }
});

test('fetchPublicSefazStatuses envia header obrigatório X-Requested-With: XMLHttpRequest, Accept JSON e sem autenticação', async () => {
  const calls = [];
  const payloadsByUrl = {
    [INTEGRANOTAS_URLS.nfe]: buildCePayload({ normal: 1, svc: 0, color: INTEGRANOTAS_COLORS.GREEN }),
    [INTEGRANOTAS_URLS.nfce]: buildCePayload({ normal: 1, svc: 0, color: INTEGRANOTAS_COLORS.YELLOW }),
    [INTEGRANOTAS_URLS.cte]: buildCePayload({ normal: 0, svc: 1, color: INTEGRANOTAS_COLORS.ORANGE }),
    [INTEGRANOTAS_URLS.mdfe]: buildCePayload({ normal: 0, svc: 0, color: INTEGRANOTAS_COLORS.RED })
  };

  const mockAxios = {
    async get(url, config) {
      calls.push({ url, config });
      return {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        data: payloadsByUrl[url]
      };
    }
  };

  const fixedTime = '2026-10-23T11:30:00.000Z';
  const result = await fetchPublicSefazStatuses(mockAxios, { checkedAt: fixedTime });

  assert.equal(calls.length, 4);
  const requestedUrls = calls.map(c => c.url);
  assert.deepEqual(requestedUrls, [
    INTEGRANOTAS_URLS.nfe,
    INTEGRANOTAS_URLS.nfce,
    INTEGRANOTAS_URLS.cte,
    INTEGRANOTAS_URLS.mdfe
  ]);

  for (const call of calls) {
    assert.equal(call.config.headers['X-Requested-With'], 'XMLHttpRequest');
    assert.match(call.config.headers.Accept, /application\/json/i);
    assert.equal(call.config.headers.Authorization, undefined);
    assert.equal(call.config.headers.Cookie, undefined);
    assert.equal(call.config.auth, undefined);
  }

  assert.equal(result.nfe.status, 'OK');
  assert.equal(result.nfce.status, 'WARNING');
  assert.equal(result.cte.status, 'WARNING');
  assert.equal(result.mdfe.status, 'DANGER');

  for (const doc of DOCUMENT_TYPES) {
    assert.equal(result[doc].uf, 'CE');
    assert.equal(result[doc].component, 'CE');
    assert.equal(result[doc].provider, 'IntegraNotas');
    assert.equal(result[doc].source, INTEGRANOTAS_URLS[doc]);
    assert.equal(result[doc].checkedAt, fixedTime);
    assert.equal(result[doc].latency, null);
    assert.equal(Object.hasOwn(result[doc], 'sourceTimestamp'), false);
  }
});

test('Rejeita resposta HTTP 200 com HTML ou Content-Type text/html como UNKNOWN', async () => {
  const htmlAxios = {
    async get(url) {
      if (url.endsWith('/nfe')) {
        return {
          status: 200,
          headers: { 'content-type': 'text/html; charset=UTF-8' },
          data: '<!DOCTYPE html><html><head><title>Monitor</title></head><body></body></html>'
        };
      }
      return {
        status: 200,
        headers: { 'content-type': 'text/html' },
        // Mesmo que um mock passasse objeto com header text/html, deve ser rejeitado
        data: buildCePayload({ normal: 1, svc: 0, color: INTEGRANOTAS_COLORS.GREEN })
      };
    }
  };

  const result = await fetchPublicSefazStatuses(htmlAxios);
  for (const doc of DOCUMENT_TYPES) {
    assert.equal(result[doc].status, 'UNKNOWN');
    assert.equal(result[doc].latency, null);
    assert.match(result[doc].detail, /inválida/i);
  }
});

test('Trata falhas HTTP (erro de rede, timeout, status != 200) retornando UNKNOWN sem fabricar latência', async () => {
  const failingAxios = {
    async get(url) {
      if (url.endsWith('/nfe')) {
        throw new Error('connect ETIMEDOUT');
      }
      if (url.endsWith('/nfce')) {
        return { status: 503, data: buildCePayload() };
      }
      if (url.endsWith('/cte')) {
        return { status: 403, data: 'Forbidden' };
      }
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: buildCePayload({ normal: 1, svc: 0, color: INTEGRANOTAS_COLORS.GREEN })
      };
    }
  };

  const result = await fetchPublicSefazStatuses(failingAxios);
  assert.equal(result.nfe.status, 'UNKNOWN');
  assert.match(result.nfe.detail, /Não foi possível consultar o monitor público IntegraNotas/);
  assert.equal(result.nfe.latency, null);

  assert.equal(result.nfce.status, 'UNKNOWN');
  assert.equal(result.nfce.latency, null);

  assert.equal(result.cte.status, 'UNKNOWN');
  assert.equal(result.cte.latency, null);

  assert.equal(result.mdfe.status, 'OK');
  assert.equal(result.mdfe.latency, null);
});

