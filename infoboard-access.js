const net = require('node:net');
const FORWARDED_HEADERS = new Set([
  'forwarded', 'x-forwarded-for', 'x-real-ip', 'x-client-ip', 'cf-connecting-ip'
]);

// A TV usa o mesmo painel e a mesma API. O acesso completo depende do IP
// diretamente conectado ao servidor, nunca de cabeçalhos informados pelo cliente.
function normalizeIp(value) {
  const ip = String(value || '').trim().toLowerCase();
  const family = net.isIP(ip);
  if (family === 4) return ip;
  if (family !== 6 || ip.includes('%')) return null;
  const canonical = new URL(`http://[${ip}]`).hostname.slice(1, -1);
  const mapped = canonical.match(/^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/);
  if (!mapped) return canonical;
  return mapped.slice(1).flatMap(part => {
    const number = parseInt(part, 16);
    return [number >>> 8, number & 255];
  }).join('.');
}

function hasForwardedHeaders(req) {
  return Object.keys(req.headers || {}).some(key => FORWARDED_HEADERS.has(key.toLowerCase()));
}

function isTvRequest(req, allowed = process.env.INFOBOARD_TV_ALLOWED_IPS || '') {
  // Proxy reverso costuma conectar via loopback; jamais conceder acesso de TV
  // a um notebook só porque a conexão chegou do proxy local.
  if (hasForwardedHeaders(req)) return false;

  const remoteIp = normalizeIp(req.socket?.remoteAddress);
  if (!remoteIp) return false;
  const configured = String(allowed).split(',').map(normalizeIp).filter(Boolean);
  return remoteIp === '127.0.0.1' || remoteIp === '::1' || configured.includes(remoteIp);
}

// LAN/VPN privada preserva o modo de operacao existente. O administrador pode
// optar por IPs explicitos com INFOBOARD_ALLOW_PRIVATE_NETWORK=false.
function isInternalViewer(req, allowed = process.env.INFOBOARD_VIEWER_ALLOWED_IPS || '',
  allowPrivateNetwork = process.env.INFOBOARD_ALLOW_PRIVATE_NETWORK === undefined ||
    process.env.INFOBOARD_ALLOW_PRIVATE_NETWORK === 'true') {
  if (isTvRequest(req, allowed)) return true;
  const remoteIp = normalizeIp(req.socket?.remoteAddress);
  if (!remoteIp || hasForwardedHeaders(req) || !allowPrivateNetwork) return false;
  if (net.isIP(remoteIp) !== 4) return false;
  const parts = remoteIp.split('.').map(Number);
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

function getPanelAccess(req, env = process.env) {
  if (isTvRequest(req, env.INFOBOARD_TV_ALLOWED_IPS || '')) return { mode: 'tv' };
  if (isInternalViewer(req, env.INFOBOARD_VIEWER_ALLOWED_IPS || '',
    env.INFOBOARD_ALLOW_PRIVATE_NETWORK === undefined || env.INFOBOARD_ALLOW_PRIVATE_NETWORK === 'true')) return { mode: 'viewer' };
  return null;
}

function filterPanelData(data, access) {
  // Os setores são acompanhados por rede autorizada, sem sessão do operador.
  return { ...data, access };
}

module.exports = { normalizeIp, isTvRequest, isInternalViewer, getPanelAccess, filterPanelData };
