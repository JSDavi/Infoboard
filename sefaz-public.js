// Fonte complementar pública: monitor SEFAZ por UF da IntegraNotas.
const INTEGRANOTAS_BASE_URL = 'https://integranotas.com.br/doc/sefaz/monitor';
const INTEGRANOTAS_PROVIDER = 'IntegraNotas';
const DEFAULT_UF = 'CE';

const DOCUMENT_TYPES = Object.freeze(['nfe', 'nfce', 'cte', 'mdfe']);

const INTEGRANOTAS_URLS = Object.freeze({
  nfe: `${INTEGRANOTAS_BASE_URL}/nfe`,
  nfce: `${INTEGRANOTAS_BASE_URL}/nfce`,
  cte: `${INTEGRANOTAS_BASE_URL}/cte`,
  mdfe: `${INTEGRANOTAS_BASE_URL}/mdfe`
});

const INTEGRANOTAS_HEADERS = Object.freeze({
  Accept: 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
  'User-Agent': 'InfoBoard/1.1 (monitor fiscal)'
});

const INTEGRANOTAS_COLORS = Object.freeze({
  GREEN: 'rgb(46, 202, 139)',
  YELLOW: 'rgb(255, 199, 0)',
  ORANGE: 'rgb(241, 116, 37)',
  RED: 'rgb(228, 63, 82)'
});

function getIntegraNotasUrl(documentType) {
  const key = String(documentType || '').trim().toLowerCase();
  return Object.hasOwn(INTEGRANOTAS_URLS, key) ? INTEGRANOTAS_URLS[key] : null;
}

function normalizeRgbColor(color) {
  if (typeof color !== 'string') return '';
  const match = color.trim().match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (!match) return '';
  const components = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (components.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return '';
  return `rgb(${components[0]}, ${components[1]}, ${components[2]})`;
}

function validateIntegraNotasPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, dados: null, reason: 'Payload não é um objeto JSON válido' };
  }
  const { dados } = payload;
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    return { valid: false, dados: null, reason: 'Campo dados ausente ou inválido' };
  }
  const requiredArrays = ['labels', 'data', 'backgroundColor', 'normal', 'svc'];
  for (const field of requiredArrays) {
    if (!Array.isArray(dados[field])) {
      return { valid: false, dados: null, reason: `Campo dados.${field} deve ser um array` };
    }
  }
  return { valid: true, dados };
}

function mapIntegraNotasStatus(entryOrNormal, svcArg, colorArg) {
  let normal;
  let svc;
  let rawColor;

  if (entryOrNormal && typeof entryOrNormal === 'object' && !Array.isArray(entryOrNormal)) {
    normal = entryOrNormal.normal;
    svc = entryOrNormal.svc;
    rawColor = entryOrNormal.backgroundColor ?? entryOrNormal.color;
  } else {
    normal = entryOrNormal;
    svc = svcArg;
    rawColor = colorArg;
  }

  if (normal !== 0 && normal !== 1) return 'UNKNOWN';
  if (svc !== undefined && svc !== 0 && svc !== 1) return 'UNKNOWN';

  const hasColor = rawColor !== undefined;
  const color = hasColor ? normalizeRgbColor(rawColor) : '';
  if (hasColor && !color) return 'UNKNOWN';

  if (color === INTEGRANOTAS_COLORS.RED) return 'DANGER';
  if (color === INTEGRANOTAS_COLORS.YELLOW || color === INTEGRANOTAS_COLORS.ORANGE) return 'WARNING';

  if (normal === 0) {
    return svc === 1 ? 'WARNING' : 'DANGER';
  }

  if (normal === 1 && color === INTEGRANOTAS_COLORS.GREEN) {
    if (svc === 1) return 'WARNING';
    return 'OK';
  }

  return 'UNKNOWN';
}

function resolveParseOptions(optionsOrUf) {
  if (typeof optionsOrUf === 'string') {
    const trimmed = optionsOrUf.trim();
    const lower = trimmed.toLowerCase();
    if (Object.hasOwn(INTEGRANOTAS_URLS, lower)) {
      return {
        uf: DEFAULT_UF,
        documentType: lower,
        source: INTEGRANOTAS_URLS[lower]
      };
    }
    return {
      uf: trimmed.toUpperCase() || DEFAULT_UF,
      documentType: null,
      source: INTEGRANOTAS_BASE_URL
    };
  }

  const opts = optionsOrUf && typeof optionsOrUf === 'object' ? optionsOrUf : {};
  const docType = opts.documentType ? String(opts.documentType).trim().toLowerCase() : null;
  const uf = opts.uf ? String(opts.uf).trim().toUpperCase() : DEFAULT_UF;
  const source = opts.source || (docType && getIntegraNotasUrl(docType)) || INTEGRANOTAS_BASE_URL;
  return { uf, documentType: docType, source };
}

function parseIntegraNotasMonitor(payload, optionsOrUf) {
  const { uf, source } = resolveParseOptions(optionsOrUf);
  const baseResult = {
    uf,
    component: uf,
    provider: INTEGRANOTAS_PROVIDER,
    source,
    latency: null
  };

  const validation = validateIntegraNotasPayload(payload);
  if (!validation.valid) {
    return {
      ...baseResult,
      status: 'UNKNOWN',
      detail: 'Resposta inválida do monitor público IntegraNotas'
    };
  }

  const { dados } = validation;
  const matchingIndices = [];
  for (let i = 0; i < dados.labels.length; i++) {
    const label = dados.labels[i];
    if (typeof label === 'string' && label.trim().toUpperCase() === uf) {
      matchingIndices.push(i);
    }
  }

  if (matchingIndices.length !== 1) {
    return {
      ...baseResult,
      status: 'UNKNOWN',
      detail: `UF ${uf} não identificada no monitor IntegraNotas`
    };
  }

  const index = matchingIndices[0];
  if (
    index >= dados.backgroundColor.length ||
    index >= dados.normal.length ||
    index >= dados.svc.length ||
    (dados.data.length > 0 && index >= dados.data.length)
  ) {
    return {
      ...baseResult,
      status: 'UNKNOWN',
      detail: 'Resposta inválida do monitor público IntegraNotas'
    };
  }

  if (dados.data.length > 0) {
    const dataPoint = dados.data[index];
    if (typeof dataPoint !== 'number' || !Number.isFinite(dataPoint)) {
      return {
        ...baseResult,
        status: 'UNKNOWN',
        detail: 'Resposta inválida do monitor público IntegraNotas'
      };
    }
  }

  const normal = dados.normal[index];
  const svc = dados.svc[index];
  const backgroundColor = dados.backgroundColor[index];

  if ((normal !== 0 && normal !== 1) || (svc !== 0 && svc !== 1) || !normalizeRgbColor(backgroundColor)) {
    return {
      ...baseResult,
      status: 'UNKNOWN',
      detail: 'Resposta inválida do monitor público IntegraNotas'
    };
  }

  const status = mapIntegraNotasStatus({ normal, svc, backgroundColor });
  if (status === 'UNKNOWN') {
    return {
      ...baseResult,
      status: 'UNKNOWN',
      detail: 'Resposta inválida do monitor público IntegraNotas'
    };
  }

  const detail = status === 'OK'
    ? `IntegraNotas (${uf}): operação normal`
    : status === 'WARNING'
      ? (normal === 0 && svc === 1
        ? `IntegraNotas (${uf}): contingência ativa (SVC)`
        : `IntegraNotas (${uf}): instabilidade ou alerta`)
      : `IntegraNotas (${uf}): indisponibilidade`;

  return {
    ...baseResult,
    status,
    detail
  };
}

function isHtmlResponse(response) {
  const headers = response?.headers;
  if (headers && typeof headers === 'object') {
    const contentType = headers['content-type'] || headers['Content-Type'] || '';
    if (typeof contentType === 'string' && /text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return true;
    }
  }
  if (typeof response?.data === 'string') {
    return true;
  }
  return false;
}

async function fetchPublicSefazDocumentStatus(axiosClient, documentType, options = {}) {
  const uf = options.uf ? String(options.uf).trim().toUpperCase() : DEFAULT_UF;
  const source = getIntegraNotasUrl(documentType);
  const checkedAt = options.checkedAt || new Date().toISOString();

  if (!source || !axiosClient || typeof axiosClient.get !== 'function') {
    return {
      status: 'UNKNOWN',
      detail: 'Não foi possível consultar o monitor público IntegraNotas',
      uf,
      component: uf,
      provider: INTEGRANOTAS_PROVIDER,
      source: source || INTEGRANOTAS_BASE_URL,
      checkedAt,
      latency: null
    };
  }

  try {
    const response = await axiosClient.get(source, {
      timeout: 10000,
      maxRedirects: 3,
      maxContentLength: 256 * 1024,
      responseType: 'json',
      headers: { ...INTEGRANOTAS_HEADERS }
    });

    if (!response || (response.status !== undefined && response.status !== 200)) {
      return {
        status: 'UNKNOWN',
        detail: 'Não foi possível consultar o monitor público IntegraNotas',
        uf,
        component: uf,
        provider: INTEGRANOTAS_PROVIDER,
        source,
        checkedAt,
        latency: null
      };
    }

    if (isHtmlResponse(response)) {
      return {
        status: 'UNKNOWN',
        detail: 'Resposta inválida do monitor público IntegraNotas',
        uf,
        component: uf,
        provider: INTEGRANOTAS_PROVIDER,
        source,
        checkedAt,
        latency: null
      };
    }

    const parsed = parseIntegraNotasMonitor(response.data, { uf, documentType, source });
    return {
      ...parsed,
      checkedAt,
      latency: null
    };
  } catch (_) {
    return {
      status: 'UNKNOWN',
      detail: 'Não foi possível consultar o monitor público IntegraNotas',
      uf,
      component: uf,
      provider: INTEGRANOTAS_PROVIDER,
      source,
      checkedAt,
      latency: null
    };
  }
}

async function fetchPublicSefazStatuses(axiosClient, options = {}) {
  const checkedAt = options.checkedAt || new Date().toISOString();
  const entries = await Promise.all(
    DOCUMENT_TYPES.map(async docType => {
      const result = await fetchPublicSefazDocumentStatus(axiosClient, docType, { ...options, checkedAt });
      return [docType, result];
    })
  );
  return Object.fromEntries(entries);
}

module.exports = {
  INTEGRANOTAS_BASE_URL,
  INTEGRANOTAS_PROVIDER,
  INTEGRANOTAS_URLS,
  INTEGRANOTAS_HEADERS,
  INTEGRANOTAS_COLORS,
  DEFAULT_UF,
  DOCUMENT_TYPES,
  getIntegraNotasUrl,
  normalizeRgbColor,
  validateIntegraNotasPayload,
  mapIntegraNotasStatus,
  parseIntegraNotasMonitor,
  fetchPublicSefazDocumentStatus,
  fetchPublicSefazStatuses
};
