'use strict';

const net = require('node:net');
const os = require('node:os');

const SAFE_NETWORK_CODES = new Set([
  'ECONNABORTED', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH',
  'ENOTFOUND', 'ETIMEDOUT', 'ERR_BAD_RESPONSE', 'ERR_NETWORK',
  'ERR_TLS_CERT_ALTNAME_INVALID', 'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
]);

// Nunca reutilizar error.message, response.data ou config.url em logs ou JSON.
function safeError(error) {
  const httpStatus = Number(error?.response?.status);
  if (Number.isInteger(httpStatus) && httpStatus >= 400 && httpStatus <= 599) {
    return `Falha de integração (HTTP ${httpStatus})`;
  }
  const code = typeof error?.code === 'string' ? error.code : '';
  if (SAFE_NETWORK_CODES.has(code)) return `Falha de integração (${code})`;
  return 'Falha de integração';
}

// Sem follow de redirects: Axios não pode enviar cookies, senha nem Bearer a outra origem.
function upstreamOptions(options = {}, timeout = 12000) {
  return { ...options, timeout, maxRedirects: 0 };
}

// Rejeita configurações manipuladas sem repetir a URL (ou credenciais) no erro.
function validatedUpstreamBaseUrl(value) {
  if (typeof value !== 'string' || !value || value.trim() !== value ||
      value.includes('?') || value.includes('#')) {
    throw new Error('Configuração de integração inválida');
  }
  let url;
  try { url = new URL(value); } catch { throw new Error('Configuração de integração inválida'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error('Configuração de integração inválida');
  }
  return url.href.replace(/\/$/, '');
}

function sameOriginRedirect(location, requestUrl) {
  if (!requestUrl || typeof location !== 'string' || !location.trim()) {
    throw new Error('Redirecionamento de integração inválido');
  }
  let source;
  let target;
  try {
    source = new URL(requestUrl);
    target = new URL(location, source);
  } catch {
    throw new Error('Redirecionamento de integração inválido');
  }
  if (!['http:', 'https:'].includes(source.protocol) || target.origin !== source.origin ||
      target.username || target.password) {
    throw new Error('Redirecionamento de integração bloqueado');
  }
  return target.href;
}

function isPrivateIp(hostname) {
  const ip = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const family = net.isIP(ip);
  if (family === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  return family === 6 && (ip === '::1' || ip.startsWith('fc') ||
    ip.startsWith('fd') || /^fe[89ab]/.test(ip));
}

function parseHost(rawHost) {
  if (typeof rawHost !== 'string' || !rawHost || /[\s@\\\/?#]/.test(rawHost)) return null;
  try {
    const parsed = new URL(`http://${rawHost}`);
    return parsed.host.toLowerCase() === rawHost.toLowerCase() ? parsed : null;
  } catch {
    return null;
  }
}

// Host + Origin protege contra DNS rebinding mesmo quando o IP remoto pertence à LAN.
// INFOBOARD_ALLOWED_HOSTS: nomes DNS próprios autorizados, separados por vírgula,
// aceitando nome[:porta]. Endereços IP privados e hostname local são aceitos.
function isAllowedApiOrigin(req, options = {}) {
  const headers = req?.headers || {};
  const host = parseHost(headers.host);
  if (!host) return false;
  const localHostname = String(options.hostname ?? os.hostname()).toLowerCase();
  const configured = String(options.allowedHosts ?? process.env.INFOBOARD_ALLOWED_HOSTS ?? '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const hostAllowed = host.hostname === 'localhost' || isPrivateIp(host.hostname) ||
    host.hostname.toLowerCase() === localHostname ||
    configured.some(allowed => {
      const parsed = parseHost(allowed);
      return parsed && (allowed.includes(':') ? parsed.host === host.host : parsed.hostname === host.hostname);
    });
  if (!hostAllowed) return false;
  if (headers.origin === undefined) return true;
  if (typeof headers.origin !== 'string' || headers.origin === 'null') return false;
  try {
    const origin = new URL(headers.origin);
    return (origin.protocol === 'http:' || origin.protocol === 'https:') &&
      origin.host.toLowerCase() === host.host.toLowerCase() &&
      origin.origin === headers.origin;
  } catch {
    return false;
  }
}

module.exports = { safeError, upstreamOptions, validatedUpstreamBaseUrl, sameOriginRedirect, isAllowedApiOrigin };
