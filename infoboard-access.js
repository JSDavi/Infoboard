const net = require('node:net');

// A TV usa o mesmo painel e a mesma API. O acesso completo depende do IP
// diretamente conectado ao servidor, nunca de cabeçalhos informados pelo cliente.
function normalizeIp(value) {
  const ip = String(value || '').trim();
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return net.isIP(normalized) ? normalized : null;
}

function isTvRequest(req, allowed = process.env.INFOBOARD_TV_ALLOWED_IPS || '') {
  // Proxy reverso costuma conectar via loopback; jamais conceder acesso de TV
  // a um notebook só porque a conexão chegou do proxy local.
  const headers = req.headers || {};
  if (headers.forwarded || headers['x-forwarded-for'] || headers['x-real-ip'] ||
      headers['x-client-ip'] || headers['cf-connecting-ip']) return false;

  const remoteIp = normalizeIp(req.socket?.remoteAddress);
  if (!remoteIp) return false;
  const configured = String(allowed).split(',').map(normalizeIp).filter(Boolean);
  return remoteIp === '127.0.0.1' || remoteIp === '::1' || configured.includes(remoteIp);
}

// O wallboard é legível na rede interna sem autenticar um ramal NPX.
// Para redes VPN fora das faixas privadas, o administrador deve informar os IPs
// de origem autorizados; acessos por proxy com cabeçalhos não recebem essa liberação.
function isInternalViewer(req, allowed = process.env.INFOBOARD_VIEWER_ALLOWED_IPS || '') {
  if (isTvRequest(req, allowed)) return true;
  const remoteIp = normalizeIp(req.socket?.remoteAddress);
  if (!remoteIp || Object.keys(req.headers || {}).some(h =>
    ['forwarded', 'x-forwarded-for', 'x-real-ip', 'x-client-ip', 'cf-connecting-ip'].includes(h.toLowerCase()))) return false;
  if (net.isIP(remoteIp) !== 4) return false;
  const parts = remoteIp.split('.').map(Number);
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

function getPanelAccess(req) {
  if (isTvRequest(req)) return { mode: 'tv' };
  if (isInternalViewer(req)) return { mode: 'viewer' };
  return null;
}

function filterPanelData(data, access) {
  // Os setores são acompanhados por rede autorizada, sem sessão do operador.
  return { ...data, access };
}

module.exports = { normalizeIp, isTvRequest, isInternalViewer, getPanelAccess, filterPanelData };
