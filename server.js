const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const https = require('https');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { getNpxSipRegistration, getAgentConnectionState, getAgentPriority, getAgentCategory } = require('./public/agent-state');
const { fetchPublicSefazStatuses } = require('./sefaz-public');
const { reconcileAgentQueues } = require('./reconcile-agent-queues');
const { applyPbxObservationToAgent } = require('./pbx-agent-state');
const { getPanelAccess, filterPanelData } = require('./infoboard-access');
const { withNpxMonitorObservation } = require('./npx-monitor-state');
const { safeError, upstreamOptions, validatedUpstreamBaseUrl, sameOriginRedirect, isAllowedApiOrigin } = require('./server-security');

// Carrega variáveis de ambiente
dotenv.config();

// Previne quedas do processo por erros não tratados de rede/rejeições de Promise
process.on('uncaughtException', (err) => {
  console.error('[Process Error] Exceção não capturada:', safeError(err));
});
process.on('unhandledRejection', (reason) => {
  console.error('[Process Error] Rejeição de Promise não tratada:', safeError(reason));
});

const app = express();
const PORT = process.env.PORT || 3001;
const UPDATE_INTERVAL = (process.env.UPDATE_INTERVAL_SECONDS || 6) * 1000;
// O monitor NPX informa estado operacional, sem comprovar registro SIP.
// O estado operacional de /rates/details_by_queue.json passa a ser o padrao.
// Permite desativacao explicita em ambientes legados sem registro confiavel.
const NPX_REQUIRE_SIP_CONFIRMATION = process.env.INFOBOARD_NPX_REQUIRE_SIP_CONFIRMATION !== 'false';

// Configurações de Segurança (Hardening)
app.use(helmet({
  contentSecurityPolicy: false // Desativado para não quebrar scripts inline do painel
}));
app.disable('x-powered-by'); // Oculta a assinatura do Express

// Rate Limit: Máximo de 400 requisições a cada 1 minuto por IP
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, 
  max: 400,
  message: { error: 'Muitas requisições originadas deste IP. Aguarde um instante.' }
});
app.use(limiter);

// Bloqueia DNS rebinding e origens cruzadas no endpoint interno.
// Nomes DNS adicionais da rede podem ser liberados via INFOBOARD_ALLOWED_HOSTS.
app.use('/api', (req, res, next) => {
  if (!isAllowedApiOrigin(req)) {
    return res.status(403).json({ error: 'Origem da requisição não autorizada.' });
  }
  next();
});

// Painel exclusivamente de leitura. Operações ficam no aplicativo oficial NPX.
// Serve arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Gerenciador simples de Cookies para manter a sessão
class CookieJar {
  constructor() {
    this.cookies = {};
  }
  
  parseSetCookie(headers) {
    const setCookie = headers['set-cookie'];
    if (!setCookie) return;
    
    const cookiesArray = Array.isArray(setCookie) ? setCookie : [setCookie];
    cookiesArray.forEach(cookieStr => {
      const parts = cookieStr.split(';')[0].split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim();
        this.cookies[key] = val;
      }
    });
  }
  
  getCookieString() {
    return Object.entries(this.cookies)
      .map(([key, val]) => `${key}=${val}`)
      .join('; ');
  }

  hasCookies() {
    return Object.keys(this.cookies).length > 0;
  }
}

// --- INTEGRAÇÃO REAL COM O PRIXCHAT (WHATSAPP) ---
let prixSessionToken = null;
let prixConnectionStatus = {
  authenticated: false,
  error: null
};

let prixAuthPromise = null;

async function authenticatePrix() {
  if (prixAuthPromise) {
    return prixAuthPromise;
  }

  const email = process.env.PRIXCHAT_EMAIL;
  const password = process.env.PRIXCHAT_PASSWORD;
  const backendUrl = validatedUpstreamBaseUrl(process.env.PRIXCHAT_BACKEND || 'https://backapp.prixchat.com.br');
  
  if (!email || !password || email === 'seu_email@empresa.com') {
    throw new Error('Credenciais do PrixChat não configuradas.');
  }
  
  prixAuthPromise = (async () => {
    try {
      console.log('[PrixChat] Iniciando autenticação.');
      const res = await axios.post(`${backendUrl}/auth/login`, {
        email,
        password
      }, upstreamOptions({
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      }));
      prixSessionToken = res.data.token;
      prixConnectionStatus.authenticated = true;
      prixConnectionStatus.error = null;
      console.log('[PrixChat] Autenticação realizada com sucesso!');
      return prixSessionToken;
    } catch (err) {
      prixConnectionStatus.authenticated = false;
      prixConnectionStatus.error = safeError(err);
      console.error('[PrixChat] Erro na autenticação:', safeError(err));
      throw err;
    } finally {
      prixAuthPromise = null;
    }
  })();

  return prixAuthPromise;
}

async function getPrixUsersMoments() {
  const email = process.env.PRIXCHAT_EMAIL;
  if (!email || email === 'seu_email@empresa.com') {
    prixConnectionStatus.isSimulated = true;
    return null; // modo simulado fallback
  }

  prixConnectionStatus.isSimulated = false;

  if (!prixSessionToken) {
    await authenticatePrix();
  }
  const backendUrl = validatedUpstreamBaseUrl(process.env.PRIXCHAT_BACKEND || 'https://backapp.prixchat.com.br');
  try {
    const res = await axios.get(`${backendUrl}/usersMoments`, upstreamOptions({
      headers: {
        'Authorization': `Bearer ${prixSessionToken}`,
        'User-Agent': 'Mozilla/5.0'
      }
    }));
    prixConnectionStatus.authenticated = true;
    prixConnectionStatus.error = null;
    return res.data;
  } catch (err) {
    if (err.response && (err.response.status === 401 || err.response.status === 403)) {
      console.log('[PrixChat] Token expirou ou foi invalidado (401/403) no moments. Re-autenticando...');
      await authenticatePrix();
      const res = await axios.get(`${backendUrl}/usersMoments`, upstreamOptions({
        headers: {
          'Authorization': `Bearer ${prixSessionToken}`,
          'User-Agent': 'Mozilla/5.0'
        }
      }));
      prixConnectionStatus.authenticated = true;
      prixConnectionStatus.error = null;
      return res.data;
    }
    prixConnectionStatus.authenticated = false;
    prixConnectionStatus.error = safeError(err);
    throw err;
  }
}

let activeSession = new CookieJar();
let lastScrapedData = null;
let connectionStatus = {
  authenticated: false,
  error: null,
  isSimulated: true,
  lastUpdate: null
};

// Últimos dados extraídos do PBX
let lastPbxData = {};
let pbxConnectionStatus = {
  authenticated: false,
  error: 'Aguardando primeira coleta do PBX',
  lastUpdate: null
};

function getPbxConnectionStatus() {
  const lastUpdateMs = Date.parse(pbxConnectionStatus.lastUpdate);
  const isStale = !Number.isFinite(lastUpdateMs) || Date.now() - lastUpdateMs > 30000;
  return {
    authenticated: pbxConnectionStatus.authenticated && !isStale,
    error: isStale && pbxConnectionStatus.authenticated
      ? 'Coleta PBX sem atualização há mais de 30 segundos'
      : pbxConnectionStatus.error,
    lastUpdate: pbxConnectionStatus.lastUpdate
  };
}

// Helper para carregar o mapeamento de analistas dinamicamente
function loadAnalystsMap() {
  try {
    const mapPath = path.join(__dirname, 'config', 'analysts_map.json');
    if (fs.existsSync(mapPath)) {
      return JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    }
  } catch (e) {
    console.error('[PBX Integrator] Erro ao carregar analysts_map.json:', safeError(e));
  }
  return {};
}

// Helper para buscar extensão por busca exata ou parcial (ex: "Davi Oliveira" mapeado, mas NPX retorna "Davi")
function getExtension(agentName, map) {
  if (!agentName) return null;
  const getVal = (v) => typeof v === 'object' ? v.ramal : v;
  
  // 1. Busca exata
  if (map[agentName]) return getVal(map[agentName]);
  
  // 2. Busca parcial resiliente
  const nameLower = agentName.toLowerCase().trim();
  for (const [key, val] of Object.entries(map)) {
    const keyLower = key.toLowerCase().trim();
    if (keyLower.includes(nameLower) || nameLower.includes(keyLower)) {
      return getVal(val);
    }
  }
  return null;
}

// Certificado TLS verificado por padrão; PBX legado requer opt-in explícito.
const pbxHttpsAgent = new https.Agent({ rejectUnauthorized: process.env.PBX_TLS_REJECT_UNAUTHORIZED !== 'false' });

// Configurações de API do PBX (lidas do .env)
const PBX_BASE_URL = process.env.PBX_BASE_URL;
const PBX_TOKEN = process.env.PBX_API_TOKEN;
const PBX_KEY = process.env.PBX_API_KEY;

// Monitor direto do PBX via API REST (substitui o Puppeteer)
async function startPbxApiMonitor() {
  if (!PBX_TOKEN || !PBX_KEY) {
    pbxConnectionStatus.error = 'Credenciais PBX não configuradas';
    console.error('[PBX API] ERRO: PBX_API_TOKEN ou PBX_API_KEY não encontrado no .env. Monitor PBX desativado.');
    return;
  }

  let pbxBaseUrl;
  try {
    pbxBaseUrl = validatedUpstreamBaseUrl(PBX_BASE_URL);
  } catch (error) {
    pbxConnectionStatus.error = safeError(error);
    console.error('[PBX API] Configuração da URL inválida:', safeError(error));
    return;
  }

  console.log('[PBX API] Iniciando monitor de API direto (sem navegador)...');

  // Fase 1: Baixa o mapa completo de username -> linha_ip dos dispositivos cadastrados
  let usernamToRamal = {};
  try {
    const devicesUrl = `${pbxBaseUrl}/api/listDevices/${PBX_TOKEN}/${PBX_KEY}`;
    const devRes = await axios.get(devicesUrl, upstreamOptions({ httpsAgent: pbxHttpsAgent }));
    if (devRes.data && devRes.data.error === 0 && devRes.data.data) {
      devRes.data.data.forEach(dev => {
        if (dev.username && dev.linha_ip) {
          usernamToRamal[dev.username] = dev.linha_ip;
        }
      });
      console.log(`[PBX API] Mapa de ramais carregado: ${Object.keys(usernamToRamal).length} dispositivos encontrados.`);
    } else {
      console.warn('[PBX API] Aviso: Não foi possível carregar o mapa de ramais. Usando device_username como ramal.');
    }
  } catch (err) {
    console.error('[PBX API] Erro ao carregar mapa de dispositivos:', safeError(err));
  }

  // Fase 2: Loop de coleta a cada 5 segundos
  async function collectPbxData() {
    try {
      // Busca dispositivos registrados (online/offline) e chamadas ativas em paralelo
      const [regRes, callsRes] = await Promise.all([
        axios.get(`${pbxBaseUrl}/api/listDevicesRegistered/${PBX_TOKEN}/${PBX_KEY}`, upstreamOptions({ httpsAgent: pbxHttpsAgent })),
        axios.get(`${pbxBaseUrl}/api/onlineCalls/${PBX_TOKEN}/${PBX_KEY}`, upstreamOptions({ httpsAgent: pbxHttpsAgent }))
      ]);

      if (regRes.data?.error !== 0 || !Array.isArray(regRes.data?.data) ||
          callsRes.data?.error !== 0 || !Array.isArray(callsRes.data?.data)) {
        throw new Error('Resposta inválida na consulta de dispositivos ou chamadas do PBX');
      }

      // Monta um mapa de chamadas ativas por ramal: { "2008": { source, destination, status_text, starttime } }
      const activeCalls = {};
      if (callsRes.data && callsRes.data.error === 0 && Array.isArray(callsRes.data.data)) {
        callsRes.data.data.forEach(call => {
          const src = String(call.source || '');
          const dst = String(call.destination || '');
          // Se source ou destination é um ramal nosso, marca como em chamada
          if (src) activeCalls[src] = call;
          if (dst) activeCalls[dst] = call;
        });
      }

      // Processa lista de dispositivos registrados
      if (regRes.data && regRes.data.error === 0 && Array.isArray(regRes.data.data)) {
        const newPbxData = {};
        regRes.data.data.forEach(dev => {
          const username = dev.device_username || '';
          // Tenta encontrar o ramal pelo mapa (username -> linha_ip) ou extrai do username
          // O username vem no formato "852008.Thiago" ou "infobrasil.thiago" -> linha_ip é "2008"
          let ramal = usernamToRamal[username] || '';
          if (!ramal) {
            // Fallback: tenta extrair número do username (ex: "852008.Thiago" -> "2008")
            const match = username.match(/85(\d{4})/);
            if (match) ramal = match[1];
          }
          if (!ramal) return; // Ignora se não conseguiu mapear

          const isRegistered = dev.device_registered === true;
          const callInfo = activeCalls[ramal] || activeCalls[username] || null;

          let mappedStatus = 'Offline';
          let pbxNumber = '';
          let pbxDuration = 0;
          let pbxDurationStr = '';
          let pbxDirection = null;

          if (!isRegistered) {
            mappedStatus = 'Offline';
          } else if (callInfo) {
            // Ramal está em chamada ativa
            mappedStatus = 'Busy';
            
            // Filtra e limpa o número para não exibir o próprio username do analista (ex: 852001.Darkison)
            const src = String(callInfo.source || '').trim();
            const dst = String(callInfo.destination || '').trim();
            const callerId = String(callInfo.callerid || callInfo.cli || callInfo.from || '').trim();
            const namePart = username ? (username.split('.')[1] || username) : '';

            const matchesAnalyst = (str) => {
              if (!str) return false;
              const sLower = str.toLowerCase();
              if (ramal && sLower.includes(ramal)) return true;
              if (namePart && namePart.length > 2 && sLower.includes(namePart.toLowerCase())) return true;
              return false;
            };

            const srcIsAnalyst = matchesAnalyst(src);
            const dstIsAnalyst = matchesAnalyst(dst);

            if (srcIsAnalyst && !dstIsAnalyst) {
              pbxNumber = dst;
              pbxDirection = 0; // Outbound
            } else if (!srcIsAnalyst && dstIsAnalyst) {
              pbxNumber = src;
              pbxDirection = 1; // Inbound
            } else if (srcIsAnalyst && dstIsAnalyst) {
              if (callerId && !matchesAnalyst(callerId)) {
                pbxNumber = callerId;
              } else {
                pbxNumber = 'Ligação Ativa';
              }
              pbxDirection = 1;
            } else {
              pbxNumber = dst || src;
              pbxDirection = 0;
            }

            if (matchesAnalyst(pbxNumber)) {
              pbxNumber = 'Ligação Ativa';
            }

            // Calcula duração se disponível
            if (callInfo.starttime) {
              const start = new Date(callInfo.starttime);
              const now = new Date();
              pbxDuration = Math.floor((now - start) / 1000);
              const mins = Math.floor(pbxDuration / 60);
              const secs = pbxDuration % 60;
              pbxDurationStr = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
            }
          } else {
            // Online mas sem chamada ativa
            mappedStatus = 'Free';
          }

          newPbxData[ramal] = {
            status: mappedStatus,
            number: pbxNumber,
            duration: pbxDuration,
            durationStr: pbxDurationStr,
            direction: pbxDirection
          };
        });
        lastPbxData = newPbxData;
      }
      pbxConnectionStatus.authenticated = true;
      pbxConnectionStatus.error = null;
      pbxConnectionStatus.lastUpdate = new Date().toISOString();
    } catch (err) {
      pbxConnectionStatus.authenticated = false;
      pbxConnectionStatus.error = safeError(err);
      console.error('[PBX API] Erro na coleta do loop:', safeError(err));
    }
  }

  // Executa imediatamente e depois a cada 5 segundos
  collectPbxData();
  setInterval(collectPbxData, 5000);
  console.log('[PBX API] Monitor iniciado com sucesso! Atualizando a cada 5s.');
}

// Inicia o monitor de API do PBX no boot do servidor
startPbxApiMonitor();

// Configuração dos setores a serem monitorados
const DEPARTMENTS = {
  'InfoBrasil_Comercial': { name: 'Comercial', path: 'InfoBrasil_Comercial' },
  'Infobrasil_finan': { name: 'Financeiro', path: 'Infobrasil_finan' },
  'InfoBrasil_SPED_Fiscal': { name: 'SPED Fiscal', path: 'InfoBrasil_SPED_Fiscal' },
  'InfoBrasil_Suporte': { name: 'Suporte', path: 'InfoBrasil_Suporte' },
  'InfoBrasil_Ponto': { name: 'Ponto', path: 'InfoBrasil_Ponto' }
};

let npxAuthPromise = null;

// Função para fazer o login no painel NPXTech
async function authenticate() {
  if (npxAuthPromise) {
    return npxAuthPromise; // Retorna a Promise existente se já estiver autenticando
  }

  const email = process.env.NPX_EMAIL;
  const password = process.env.NPX_PASSWORD;

  if (!email || !password || email === 'seu_email@empresa.com') {
    throw new Error('Credenciais padrão ou ausentes no arquivo .env. Usando modo simulador.');
  }

  console.log('[NPX Integrator] Iniciando autenticação.');
  const jar = new CookieJar();

  npxAuthPromise = (async () => {
    try {
      // 1. GET para pegar a página de login e o token de autenticidade (CSRF) do Rails
      const getRes = await axios.get('https://app.npxtech.com.br/users/sign_in', upstreamOptions({
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }));

      jar.parseSetCookie(getRes.headers);
      const $ = cheerio.load(getRes.data);
      const token = $('input[name="authenticity_token"]').val() || $('meta[name="csrf-token"]').attr('content');

      if (!token) {
        throw new Error('Token CSRF (authenticity_token) não encontrado na página de login.');
      }

      // 2. POST enviando os dados de login
      const params = new URLSearchParams();
      params.append('authenticity_token', token);
      params.append('user[email]', email);
      params.append('user[password]', password);
      params.append('commit', 'Entrar');

      const npxLoginUrl = 'https://app.npxtech.com.br/users/sign_in';
      const postRes = await axios.post(npxLoginUrl, params.toString(), upstreamOptions({
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': jar.getCookieString(),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        validateStatus: (status) => status >= 200 && status < 400
      }));

      jar.parseSetCookie(postRes.headers);

      // A sessão só acompanha redirecionamentos dentro da origem autenticada.
      let redirectLocation = postRes.headers['location'];
      let previousUrl = npxLoginUrl;
      for (let redirectCount = 0; redirectLocation && redirectCount < 5; redirectCount++) {
        const redirectUrl = sameOriginRedirect(redirectLocation, previousUrl);
        const redirectResponse = await axios.get(redirectUrl, upstreamOptions({
          headers: {
            'Cookie': jar.getCookieString(),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          validateStatus: (status) => status >= 200 && status < 400
        }));
        jar.parseSetCookie(redirectResponse.headers);
        redirectLocation = redirectResponse.headers['location'];
        previousUrl = redirectUrl;
      }
      if (redirectLocation) throw new Error('Limite de redirecionamentos da integração excedido');

      activeSession = jar;
      connectionStatus.authenticated = true;
      connectionStatus.isSimulated = false;
      connectionStatus.error = null;
      console.log('[NPX Integrator] Autenticação realizada com sucesso (Sessão consolidada)!');
      return true;
    } catch (error) {
      connectionStatus.authenticated = false;
      connectionStatus.error = safeError(error);
      console.error('[NPX Integrator] Erro na autenticação:', safeError(error));
      throw error;
    } finally {
      npxAuthPromise = null; // Limpa a promise após terminar
    }
  })();

  return npxAuthPromise;
}

// Helper para fazer requisição GET na API do NPX (JSON) com cookies
async function apiGet(endpoint, params = {}, retried = false) {
  if (!connectionStatus.authenticated || !activeSession.hasCookies()) {
    await authenticate();
  }

  const url = `https://app.npxtech.com.br${endpoint}`;
  
  try {
    const res = await axios.get(url, upstreamOptions({
      params,
      headers: {
        'Cookie': activeSession.getCookieString(),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest'
      }
    }, 20000));

    // Se o HTML retornado contém o formulário de login, nossa sessão expirou
    if (typeof res.data === 'string' && (res.data.includes('new_user') || res.data.includes('users/sign_in'))) {
      console.log('[NPX Integrator] Sessão expirou. Re-autenticando...');
      activeSession = new CookieJar();
      connectionStatus.authenticated = false;
      // Credenciais inválidas não podem iniciar uma cadeia infinita de logins.
      if (retried) throw new Error('Sessão NPX não confirmada após autenticação');
      await authenticate();
      return apiGet(endpoint, params, true);
    }

    return res.data;
  } catch (error) {
    // Se for 401 ou erro de conexão (ECONNRESET, ETIMEDOUT, etc.), limpa os cookies para forçar login novo
    console.error('[NPX Integrator] Falha ao buscar dados:', safeError(error));
    activeSession = new CookieJar();
    connectionStatus.authenticated = false;
    connectionStatus.error = safeError(error);
    throw error;
  }
}

// Converte string de duração "HH:MM:SS" em segundos
function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0;
  if (typeof timeStr === 'number') return timeStr;
  
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) {
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  } else if (parts.length === 2) {
    return (parts[0] * 60) + parts[1];
  }
  return Number(timeStr) || 0;
}

// Auxiliar para formatar segundos em HH:MM:SS
function formatSecondsToTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (num) => String(num).padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

// Gerador de dados simulados de alta fidelidade
function emptyDepartmentData() {
  return { queue: 0, wait_time_sec: 0, agents: [], calls: [],
    agents_online: 0, agents_busy: 0, agents_paused: 0, agents_free: 0 };
}

function emptyDepartments() {
  return Object.fromEntries(Object.keys(DEPARTMENTS).map(key => [key, emptyDepartmentData()]));
}

// Gerador de dados simulados de alta fidelidade (somente demo explícita)
function generateSimulatedData() {
  const time = new Date();
  const seed = time.getMinutes() + (time.getSeconds() / 60);
  
  // Variações senoidais simples para simular fluxo de chamadas real
  const getSimValue = (base, amplitude, freq, shift) => {
    return Math.max(0, Math.round(base + amplitude * Math.sin(seed * freq + shift)));
  };

  const depts = {};
  Object.entries(DEPARTMENTS).forEach(([key, dept]) => {
    const online = getSimValue(8, 2, 0.5, key.charCodeAt(0));
    const queue = getSimValue(2, 3, 1.2, key.charCodeAt(1));
    const busy = Math.min(online, getSimValue(4, 3, 0.7, key.charCodeAt(2)));
    const paused = getSimValue(1, 1, 0.2, key.charCodeAt(3));
    const free = Math.max(0, online - busy - paused);

    const calls = [];
    const agents = [];

    // Nomes fictícios de analistas por setor para simulação
    const analystNames = {
      'InfoBrasil_Comercial': ['Ana', 'Carlos', 'Mariana', 'Roberto', 'Juliana', 'Pedro', 'Beatriz', 'Felipe'],
      'Infobrasil_finan': ['Daniel', 'Gabriela', 'Ricardo', 'Sofia', 'Renato', 'Luisa'],
      'InfoBrasil_SPED_Fiscal': ['Marcos', 'Helena', 'Sandra', 'Vitor', 'Camila'],
      'InfoBrasil_Suporte': ['Edson', 'Murilo', 'Anndro', 'Bruno', 'Thiago', 'Patricia', 'Fernando', 'Rogerio', 'Kleber', 'Alex']
    }[key] || ['Analista A', 'Analista B', 'Analista C'];

    // Gerar lista de agentes online e seus status
    for (let i = 0; i < online; i++) {
      const name = analystNames[i % analystNames.length];
      const extension = `4422${String(10 + i + (key.charCodeAt(0) % 10))}`;
      let status = 1; // 1 = Livre, 2 = Ocupado, 5 = Pausado
      let callTimeStr = "00:00:00";
      let src = "";

      if (i < busy) {
        status = 2; // Ocupado
        const durationSec = getSimValue(120, 90, 2.5, i);
        callTimeStr = formatSecondsToTime(durationSec);
        src = `(11) 9${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`;
        
        // Adiciona à lista de chamadas ativas também
        calls.push({
          id: `sim-act-${key}-${i}`,
          client: src,
          agent: name,
          time_sec: durationSec,
          status: 'Atendimento'
        });
      } else if (i < busy + paused) {
        status = 5; // Pausado
        callTimeStr = formatSecondsToTime(getSimValue(60, 30, 0.5, i));
      } else {
        status = 1; // Livre
        callTimeStr = formatSecondsToTime(getSimValue(300, 200, 1, i));
      }

      agents.push({
        penalty: 1,
        paused: status === 5 ? 1 : 0,
        code: extension,
        src: src,
        extension: extension,
        name: name,
        time: callTimeStr,
        duration: parseTimeToSeconds(callTimeStr),
        status: status,
        total_paused_time: status === 5 ? "00:10:00" : "00:00:00",
        total_loged_time: "04:15:30",
        total_call_time: status === 2 ? "01:22:15" : "00:45:00",
        total_lazy_time: "02:08:15",
        dst: ""
      });
    }

    // Ordena analistas: Ocupados primeiro, depois Pausados, depois Livres
    agents.sort((a, b) => {
      if (a.status === b.status) return 0;
      if (a.status === 2) return -1;
      if (b.status === 2) return 1;
      if (a.status === 5) return -1;
      if (b.status === 5) return 1;
      return 0;
    });

    // Adiciona chamadas na fila
    for (let i = 0; i < queue; i++) {
      calls.push({
        id: `sim-q-${key}-${i}`,
        client: `Fila - (19) 9${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
        agent: null,
        time_sec: getSimValue(45, 30, 4.2, i),
        status: 'Fila'
      });
    }

    const waitTime = queue > 0 ? getSimValue(90, 60, 1.5, key.charCodeAt(4)) : 0;

    depts[key] = {
      name: dept.name,
      queue: queue,
      active: busy,
      wait_time_sec: waitTime,
      agents_online: online,
      agents_busy: busy,
      agents_paused: paused,
      agents_free: free,
      calls: calls,
      agents: agents
    };
  });

  return {
    timestamp: time.toISOString(),
    status: connectionStatus,
    departments: depts
  };
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TRUSTED_HORARIOS_IMAGE_HOSTS = new Set([
  '192.168.243.2:8888',
  'srv-ads002:8888'
]);

function normalizeTrustedHorariosImageSrc(src) {
  if (!src) return '';
  try {
    const url = new URL(String(src), 'http://192.168.243.2:8888/');
    const trustedProtocol = url.protocol === 'http:' || url.protocol === 'https:';
    const trustedHost = TRUSTED_HORARIOS_IMAGE_HOSTS.has(url.host.toLowerCase());
    if (!trustedProtocol || !trustedHost || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

function safeTickerImageSrc(src) {
  return escapeHtml(normalizeTrustedHorariosImageSrc(src));
}

function isWorkingHours() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  // Domingo (0): Fora de expediente
  if (day === 0) return false;

  // Segunda a Sexta (1 a 5): 08:00 às 19:00
  if (day >= 1 && day <= 5) {
    return hour >= 8 && hour < 19;
  }

  // Sábado (6): 08:00 às 18:00
  if (day === 6) {
    return hour >= 8 && hour < 18;
  }

  return false;
}

// Caches persistentes para garantir 100% de unicidade e NUNCA duplicar mensagens no Telegram
const pendingAlertSent = new Set();   // IDs de tickets que já geraram alerta de fila
const claimedAlertSent = new Set();   // IDs de tickets que já geraram confirmação de atendimento assumido
const pendingTicketTimes = new Map(); // ID -> Tempo de espera original na fila (segundos)

async function checkAndSendTelegramSlaAlerts(prixchatResult) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const enabled = process.env.ENABLE_TELEGRAM_ALERTS !== 'false';
  const slaLimitSec = parseInt(process.env.TELEGRAM_SLA_LIMIT_SEC || '420', 10);
  const isDevPort = process.env.PORT === '3001';

  // 1. Trava do Ambiente de Dev (Porta 3001): Nunca dispara Telegram durante testes
  if (isDevPort) return;

  // 2. Trava de Horário de Atendimento (Seg-Sex 8h-19h / Sáb 8h-18h)
  if (!isWorkingHours()) return;

  if (!enabled || !botToken || !chatId || !prixchatResult) return;

  const pendingTickets = prixchatResult.pending || [];
  const agentsList = Array.isArray(prixchatResult.agents) 
    ? prixchatResult.agents 
    : (prixchatResult.agents ? Object.values(prixchatResult.agents) : []);

  // 1. Checa tickets na fila de pendentes que estouraram SLA (5 min)
  for (const t of pendingTickets) {
    const ticketId = t.id ? String(t.id) : `${t.client}_${t.sector}`;

    if (t.timeSec >= slaLimitSec) {
      pendingTicketTimes.set(ticketId, t.timeSec);
      if (t.id) pendingTicketTimes.set(`${t.client}_${t.sector}`, t.timeSec);

      // Envia notificação apenas 1 única vez por ticket
      if (!pendingAlertSent.has(ticketId)) {
        pendingAlertSent.add(ticketId);
        if (t.id) pendingAlertSent.add(`${t.client}_${t.sector}`);

        const mins = Math.floor(t.timeSec / 60);
        const protoText = t.id ? `\nProtocolo: #${t.id}` : '';
        const msg = `🚨 <b>ALERTA DE FILA - ${t.sector.toUpperCase()}</b>\nO cliente <b>${escapeHtml(t.client)}</b> está há <b>${mins} minutos</b> esperando!${protoText}`;

        try {
          await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text: msg,
            parse_mode: 'HTML'
          }, upstreamOptions());
          console.log('[Telegram Bot] Alerta de SLA enviado.');
        } catch (err) {
          console.error('[Telegram Bot] Erro ao enviar alerta:', safeError(err));
        }
      }
    }
  }

  // 2. Checa se algum atendimento que havia gerado alerta de SLA foi assumido por um analista
  for (const agent of agentsList) {
    if (agent.tickets && Array.isArray(agent.tickets)) {
      for (const t of agent.tickets) {
        const ticketId = t.id ? String(t.id) : `${t.client}_${t.sector}`;
        const hadAlert = pendingAlertSent.has(ticketId) || pendingAlertSent.has(`${t.client}_${t.sector}`);

        // Só notifica se esse ticket teve alerta de estouro de SLA e ainda NÃO foi notificado como assumido
        if (hadAlert && !claimedAlertSent.has(ticketId)) {
          claimedAlertSent.add(ticketId);
          if (t.id) claimedAlertSent.add(`${t.client}_${t.sector}`);

          const waitSec = pendingTicketTimes.get(ticketId) || pendingTicketTimes.get(`${t.client}_${t.sector}`) || t.timeSec || 0;
          const totalMins = Math.floor(waitSec / 60);
          const protoText = t.id ? `\nProtocolo: #${t.id} (Espera: ${totalMins} min)` : `\n(Espera: ${totalMins} min)`;
          const msg = `✅ <b>FILA ANDOU - ${t.sector.toUpperCase()}</b>\nO analista <b>${escapeHtml(agent.name)}</b> assumiu o chat de <b>${escapeHtml(t.client)}</b>.${protoText}`;

          try {
            await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              chat_id: chatId,
              text: msg,
              parse_mode: 'HTML'
            }, upstreamOptions());
            console.log('[Telegram Bot] Confirmação de atendimento enviada.');
          } catch (err) {
            console.error('[Telegram Bot] Erro ao enviar confirmação de atendimento assumido:', safeError(err));
          }
        }
      }
    }
  }
}

async function runUpdateCycle() {
  const isDefaultEnv = !process.env.NPX_EMAIL || process.env.NPX_EMAIL === 'seu_email@empresa.com';

  if (isDefaultEnv) {
    // Modo simulado
    connectionStatus.isSimulated = true;
    connectionStatus.authenticated = false;
    connectionStatus.error = 'Modo simulador ativo (edite o arquivo .env para conectar ao NPX real)';
    connectionStatus.lastUpdate = new Date().toISOString();
    lastScrapedData = generateSimulatedData();
    return;
  }

  try {
    const deptsData = {};
    connectionStatus.lastUpdate = new Date().toISOString();

    const departmentsArray = Object.entries(DEPARTMENTS);

    const analystsMap = loadAnalystsMap();
    // Todas as filas desta coleta usam o mesmo retrato do PBX. Como a
    // consulta NPX e a atualização PBX são assíncronas, ler lastPbxData
    // dentro de cada fila produz cards diferentes para o mesmo ramal.
    const pbxDataSnapshot = getPbxConnectionStatus().authenticated ? lastPbxData : {};

    // Executa as requisições do NPX e do PrixChat em paralelo
    const [npxResults, prixMoments] = await Promise.all([
      Promise.all(departmentsArray.map(async ([key, dept]) => {
        if (process.env.LOG_LEVEL === 'debug') console.log(`[NPX Integrator] Coletando dados JSON do monitor: ${dept.name}...`);
        
        // Busca dados concorrentemente para este setor
        const [totals, details, waitCalls] = await Promise.all([
          apiGet('/rates/totals_filter_by_queues.json', { queue: dept.path, queue_type: 'LOG' }),
          apiGet('/rates/details_by_queue.json', { queue: dept.path, queue_type: 'LOG' }).then(data => {
            if (!NPX_REQUIRE_SIP_CONFIRMATION) return data;
            return { ...data, details: withNpxMonitorObservation(data?.details, dept.path) };
          }),
          apiGet('/rates/wait_calls.json', { queue: dept.path })
        ]);

        // Pequena pausa suave (150ms) entre setores para não enviar tudo em rajada (anti rate-limit)
        await new Promise(resolve => setTimeout(resolve, 150));

        // Organiza a contagem de fila e tempos
        const queueCount = totals.total_wait !== undefined ? totals.total_wait : (waitCalls.wait_calls || []).length;
        const waitTimeSec = parseTimeToSeconds(totals.wait);
        const online = (totals.total_free || 0) + (totals.total_busy || 0) + (totals.total_paused || 0);

        // Constrói lista unificada de ligações (Fila + Em Atendimento)
        const calls = [];
        
        // 1. Ligações em fila
        if (waitCalls && waitCalls.wait_calls) {
          waitCalls.wait_calls.forEach((wCall, idx) => {
            if (wCall.linkedid !== 'CALLBACK') {
              calls.push({
                id: `real-wait-${wCall.linkedid || idx}`,
                client: wCall.number || 'Cliente Fila',
                agent: null,
                time_sec: parseTimeToSeconds(wCall.wait),
                status: 'Fila'
              });
            }
          });
        }

        // Copia os analistas antes de incorporar o estado do PBX.
        let sortedAgents = details && details.details ? [...details.details] : [];

        // Injeta o status do PBX nos analistas retornados (Para a API Real)
        // Nunca reutiliza presenca PBX apos falha ou expiração da ultima coleta.
        const pbxData = pbxDataSnapshot;
        const pbxInOtherDepartment = new Set();
        sortedAgents.forEach(agent => {
          // A presença vem do monitor NPX desta coleta, independentemente do SIP.
          agent.npxQueuePresent = true;
          agent.npxSipRegistered = getNpxSipRegistration(agent, { explicitOnly: NPX_REQUIRE_SIP_CONFIRMATION });
          agent.npxRequireSipConfirmation = NPX_REQUIRE_SIP_CONFIRMATION;
          const ramal = getExtension(agent.name, analystsMap);
          agent.ramal = ramal;
          
          // Encontra a configuração mapeada do analista
          const mappedEntry = Object.entries(analystsMap).find(([k]) => {
            const kLower = k.toLowerCase().trim();
            const aNameLower = agent.name.toLowerCase().trim();
            return kLower.includes(aNameLower) || aNameLower.includes(kLower);
          });
          const val = mappedEntry ? mappedEntry[1] : null;
          const dept = val && typeof val === 'object' ? val.departamento : 'InfoBrasil_Suporte';
          // O registro do ramal independe da fila NPX exibida. Um dispositivo
          // desregistrado deve ter o mesmo estado em qualquer setor.
          applyPbxObservationToAgent(agent, {
            pbxInfo: pbxData[ramal], ramal, mappedQueue: dept, currentQueue: key
          });

          // agent.status informa a situacao na fila, nao o registro SIP do MicroSIP.

          // PBX registrado aparece exclusivamente no setor cadastrado do analista.
          // Uma presença residual em outra fila NPX não cria um segundo card online.
          // Uma troca valida pode levar o analista para outro setor sem mudar
          // seu departamento cadastrado no mapa do PBX.
          const npxActiveHere = NPX_REQUIRE_SIP_CONFIRMATION &&
            getAgentConnectionState(agent).isNpxQueueOnline;
          if (val && dept !== key && ramal && ['Free', 'Busy'].includes(pbxData[ramal]?.status) &&
              !npxActiveHere) {
            pbxInOtherDepartment.add(agent);
            return;
          }

          // Tempo acumulado de login nao prova presenca SIP e nao altera o status original.
        });
        sortedAgents = sortedAgents.filter(agent => !pbxInOtherDepartment.has(agent));

        // Injeta analistas mapeados que estão offline no NPX mas logados no PBX (Free ou Busy)
        Object.entries(analystsMap).forEach(([name, val]) => {
           const ramal = typeof val === 'object' ? val.ramal : val;
           const dept = typeof val === 'object' ? val.departamento : 'InfoBrasil_Suporte';

           // Só injeta o analista se o seu departamento/setor cadastrado for igual à fila atual
           if (dept === key) {
              if (pbxData[ramal] && pbxData[ramal].status !== 'Offline') {
                 const alreadyExists = sortedAgents.find(a => {
                   const aName = a.name.toLowerCase().trim();
                   const mName = name.toLowerCase().trim();
                   return aName.includes(mName) || mName.includes(aName);
                 });
                 if (!alreadyExists) {
                   const pbxInfo = pbxData[ramal];
                   // Adiciona o analista offline ao array com status NPX=0 para seguir o padrão PBX
                   sortedAgents.push({
                      name: name,
                      ramal: ramal,
                      status: 0,
                      npxQueuePresent: false,
                      npxSipRegistered: false,
                      npxRequireSipConfirmation: NPX_REQUIRE_SIP_CONFIRMATION,
                      pbxMonitorConfirmed: true,
                      pbxStatus: pbxInfo.status,
                      pbxNumber: pbxInfo.number,
                      pbxDuration: pbxInfo.duration,
                      pbxDurationStr: pbxInfo.durationStr,
                      pbxDirection: pbxInfo.direction,
                      total_loged_time: "00:00:00",
                      total_paused_time: "00:00:00",
                      total_call_time: "00:00:00",
                      total_lazy_time: "00:00:00"
                   });
                 }
              }
           }
        });

        // Chamadas ativas NPX somente após aplicar a precedência PBX e remover
        // eventuais presenças residuais em outras filas.
        sortedAgents.forEach(agent => {
          const state = getAgentConnectionState(agent);
          if (state.isRealNpxCall) {
            calls.push({
              id: `real-act-${agent.code}`,
              client: state.hasRealPhoneDst ? state.dstText : state.srcText,
              agent: agent.name,
              time_sec: parseTimeToSeconds(agent.time),
              status: 'Atendimento'
            });
          }
        });

        // Recalcula os totais com base no estado final modificado pelo PBX
        let finalBusy = 0;
        let finalPaused = 0;
        let finalFree = 0;
        let finalOnline = 0;

        sortedAgents.forEach(agent => {
          // Um analista pode estar conectado apenas no PBX. Contabiliza uma
          // única vez por pessoa, respeitando a precedência pausa > ocupado > livre.
           const category = getAgentCategory(agent);
           if (category === 'paused') finalPaused++;
           else if (category === 'busy') finalBusy++;
           else if (category === 'free') finalFree++;
        });
        finalOnline = finalBusy + finalPaused + finalFree;

        // Reordena para garantir que ocupados fiquem no topo
        sortedAgents.sort((a, b) => getAgentPriority(a) - getAgentPriority(b) ||
          String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));

        return {
          key,
          data: {
            name: dept.name,
            queue: queueCount,
            active: finalBusy,
            wait_time_sec: waitTimeSec,
            agents_online: finalOnline,
            agents_busy: finalBusy,
            agents_paused: finalPaused,
            agents_free: finalFree,
            calls: calls,
            agents: sortedAgents
          }
        };
      })),
      getPrixUsersMoments().catch(err => {
        console.error('[PrixChat] Erro ao coletar tickets reais de WhatsApp:', safeError(err));
        return null;
      })
    ]);

    // Preenche as informações dos departamentos NPX
    npxResults.forEach(res => {
      deptsData[res.key] = res.data;
    });

    // Formata os tickets obtidos do PrixChat
    const formattedPrix = {
      pending: [],
      agents: {}
    };

    if (prixMoments && Array.isArray(prixMoments)) {
      prixMoments.forEach(ticket => {
        const contactName = ticket.contact?.name || 'Cliente';
        const lastMsg = ticket.lastMessage || '';
        const updatedAt = ticket.updatedAt;
        const status = ticket.status;
        
        let timeStr = '00:00';
        let timeSec = 0;
        if (updatedAt) {
          const ticketDate = new Date(updatedAt);
          const now = new Date();
          
          // Verifica se é o mesmo dia, mês e ano
          const isToday = ticketDate.getDate() === now.getDate() &&
                          ticketDate.getMonth() === now.getMonth() &&
                          ticketDate.getFullYear() === now.getFullYear();
          
          const pad = (n) => String(n).padStart(2, '0');
          
          if (isToday) {
            timeStr = `${pad(ticketDate.getHours())}:${pad(ticketDate.getMinutes())}`;
          } else {
            timeStr = `${pad(ticketDate.getDate())}/${pad(ticketDate.getMonth() + 1)}`;
          }
          
          timeSec = Math.floor((now - ticketDate) / 1000);
        }
        
        let sector = 'suporte';
        const queueName = ticket.queue?.name?.toLowerCase() || '';
        if (queueName.includes('comercial')) sector = 'comercial';
        else if (queueName.includes('financeiro') || queueName.includes('finan')) sector = 'financeiro';
        else if (queueName.includes('sped')) sector = 'sped';
        
        const ticketObj = {
          id: ticket.id,
          client: contactName,
          msg: lastMsg,
          time: timeStr,
          sector: sector,
          timeSec: timeSec
        };
        
        if (status === 'pending') {
          formattedPrix.pending.push(ticketObj);
        } else if (status === 'open' && ticket.user) {
          const agentId = ticket.user.id;
          const agentName = ticket.user.name || 'Atendente';
          const isOnline = ticket.user.online !== false;
          
          if (!formattedPrix.agents[agentId]) {
            formattedPrix.agents[agentId] = {
              id: agentId,
              name: agentName,
              online: isOnline,
              tickets: []
            };
          }
          formattedPrix.agents[agentId].tickets.push(ticketObj);
        }
      });
    }

    const prixchatResult = {
      pending: formattedPrix.pending,
      agents: Object.values(formattedPrix.agents)
    };

    // Aciona verificação de alertas de SLA e confirmação de atendimento assumido para o Telegram
    checkAndSendTelegramSlaAlerts(prixchatResult);

    lastScrapedData = {
      timestamp: new Date().toISOString(),
      status: {
        npx: {
          authenticated: connectionStatus.authenticated,
          isSimulated: connectionStatus.isSimulated,
          error: connectionStatus.error
        },
        pbx: getPbxConnectionStatus(),
        prix: {
          authenticated: prixConnectionStatus.authenticated,
          isSimulated: prixConnectionStatus.isSimulated,
          error: prixConnectionStatus.error
        },
        isSimulated: connectionStatus.isSimulated
      },
      departments: deptsData,
      prixchat: prixchatResult,
      sefaz: sefazDataCache
    };
  } catch (err) {
    console.error('[NPX Integrator] Erro no ciclo de atualização. Mantendo último dado conhecido:', safeError(err));
    connectionStatus.error = safeError(err);
    connectionStatus.authenticated = false;

    if (lastScrapedData && (!lastScrapedData.status || !lastScrapedData.status.isSimulated)) {
      // Mantém os dados antigos na tela (congelados) e apenas acende o alerta de erro
      // Uma coleta NPX indisponível não pode manter presença na fila como online.
      for (const dept of Object.values(lastScrapedData.departments || {})) {
        for (const agent of dept.agents || []) agent.npxQueuePresent = false;
        const categories = (dept.agents || []).map(getAgentCategory);
        dept.agents_busy = categories.filter(c => c === 'busy').length;
        dept.agents_paused = categories.filter(c => c === 'paused').length;
        dept.agents_free = categories.filter(c => c === 'free').length;
        dept.agents_online = dept.agents_busy + dept.agents_paused + dept.agents_free;
      }
      lastScrapedData.status.npx = {
        authenticated: false,
        isSimulated: false,
        error: safeError(err)
      };
      lastScrapedData.status.isSimulated = false;
    } else {
      // Só gera simulado se a API nunca tiver respondido desde que ligou o servidor
      const simulatedFallback = generateSimulatedData();
      simulatedFallback.status = {
        npx: {
          authenticated: false,
          isSimulated: true,
          error: safeError(err)
        },
        pbx: getPbxConnectionStatus(),
        prix: {
          authenticated: prixConnectionStatus.authenticated,
          isSimulated: prixConnectionStatus.isSimulated,
          error: prixConnectionStatus.error
        },
        isSimulated: true
      };
      lastScrapedData = simulatedFallback;
    }
  }
}

// --- INTEGRAÇÃO COM PORTAL DE HORÁRIOS E ESCALAS (SRV-ADS002) ---
let horariosCache = null;
let horariosFetchPromise = null;
let horariosRetryTimer = null;
let horariosRetryDelay = 30 * 1000;
const HORARIOS_RETRY_MAX_DELAY = 5 * 60 * 1000;

function scheduleHorariosRetry() {
  if (horariosCache || horariosRetryTimer) return;
  horariosRetryTimer = setTimeout(() => {
    horariosRetryTimer = null;
    fetchHorariosData();
  }, horariosRetryDelay);
  horariosRetryDelay = Math.min(horariosRetryDelay * 2, HORARIOS_RETRY_MAX_DELAY);
}

function rebuildTicker() {
  if (!horariosCache) return;
  const partsHtml = [
    horariosCache.pillEscala,
    horariosCache.pillSobreaviso,
    horariosCache.pillApoio,
    horariosCache.pillDomingos,
    horariosCache.pillFerias,
    horariosCache.pillEventos,
    horariosCache.pillAniversariantes,
    hospedagensCache.tickerHtml
  ].filter(Boolean);

  horariosCache.tickerHtml = partsHtml.join(' ');
  horariosCache.tickerText = [
    horariosCache.baseTickerText,
    hospedagensCache.tickerText
  ].filter(Boolean).join('  |  ');
}

function getNextSaturdayString() {
  const d = new Date();
  const day = d.getDay();
  const diff = (6 - day + 7) % 7;
  d.setDate(d.getDate() + diff);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fetchHorariosData() {
  if (horariosFetchPromise) return horariosFetchPromise;
  horariosFetchPromise = collectHorariosData().finally(() => {
    horariosFetchPromise = null;
  });
  return horariosFetchPromise;
}

async function collectHorariosData() {
  const satDate = getNextSaturdayString();
  const [yyyy, mm, dd] = satDate.split('-');
  const formattedSatDate = `${dd}/${mm}/${yyyy}`;

  let res = null;
  const urlsToTry = [
    `http://srv-ads002:8888/horarios?sabado=${satDate}`,
    `http://192.168.243.2:8888/horarios?sabado=${satDate}`
  ];

  for (const url of urlsToTry) {
    try {
      res = await axios.get(url, { timeout: 6000 });
      if (res && res.data) break;
    } catch (err) {
      // Tenta a próxima URL
    }
  }

  if (!res || !res.data) {
    console.error('[Horarios Scraper] Não foi possível conectar ao servidor de horários (srv-ads002 / 192.168.243.2).');
    scheduleHorariosRetry();
    return;
  }

  try {
    const $ = cheerio.load(res.data);

    const turnos = [];
    $('.card').eq(0).find('.coluna-turno').each((i, el) => {
      const turnoStr = $(el).find('.coluna-turno-header').text().replace('⏰', '').trim();
      const tecs = [];
      $(el).find('.card-tec').each((ci, tec) => {
        const nome = $(tec).find('.card-nome').text().trim();
        const obs = $(tec).find('.card-obs').text().trim();
        const isApoio = obs.includes('Apoio');
        tecs.push(isApoio ? `${nome} (Apoio)` : nome);
      });
      if (turnoStr && tecs.length > 0) {
        turnos.push(`[${turnoStr}] ${tecs.join(', ')}`);
      }
    });

    const sobreavisoArr = [];
    $('.secao-sobreaviso-box').find('.subcoluna-box').eq(0).find('.card-tec').each((i, tec) => {
      sobreavisoArr.push($(tec).find('.card-nome').text().trim());
    });

    const apoioFixoArr = [];
    $('.secao-sobreaviso-box').find('.subcoluna-box').eq(1).find('.card-tec').each((i, tec) => {
      apoioFixoArr.push($(tec).find('.card-nome').text().trim());
    });

    // Extrai todas as ausências, férias e licenças cadastradas na ordem exata do card
    let $ausenciasCard = null;
    $('.card').each((_, card) => {
      const text = $(card).find('h1, h2, h3, h4, h5, h6, .card-header, .card-title, table th').text().toLowerCase();
      if (text.includes('ausências') || text.includes('ausencias') || text.includes('licenças') || text.includes('licencas')) {
        $ausenciasCard = $(card);
        return false;
      }
    });
    if (!$ausenciasCard) {
      $ausenciasCard = $('.card').eq(2);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const parseDateBR = (str) => {
      if (!str) return null;
      const parts = str.split('/');
      if (parts.length === 3) {
        return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      }
      return null;
    };

    const ausenciasArr = [];
    const ausenciasHtmlArr = [];

    // --- ESCALA DE SOBREAVISO AOS DOMINGOS (PLANTÃO TEF) ---
    let $domingoCard = $('#secao-escala-domingo');
    if ($domingoCard.length === 0) {
      $('.card').each((_, card) => {
        const text = $(card).find('h1, h2, h3, h4, h5, h6, .card-header, .card-title, .section-header').text().toLowerCase();
        if (text.includes('domingo') || text.includes('plantão tef') || text.includes('plantao tef')) {
          $domingoCard = $(card);
          return false;
        }
      });
    }

    const sobreavisoDomingosArr = [];
    $domingoCard.find('.card-tec').each((_, card) => {
      const $spanData = $(card).find('[data-domingo]').first();
      let dataIso = ($spanData.attr('data-domingo') || '').trim();
      const rawDateText = ($spanData.text() || $(card).text() || '').trim();
      const brMatch = rawDateText.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
      let dataBr = brMatch ? brMatch[0] : '';

      if (!dataBr && /^\d{4}-\d{2}-\d{2}$/.test(dataIso)) {
        const [y, m, d] = dataIso.split('-');
        dataBr = `${d}/${m}/${y}`;
      } else if (!dataIso && brMatch) {
        dataIso = `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
      }

      let domDate = null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) {
        const [y, m, d] = dataIso.split('-').map(Number);
        domDate = new Date(y, m - 1, d);
      } else {
        domDate = parseDateBR(dataBr);
      }
      if (!domDate || Number.isNaN(domDate.getTime())) return;
      domDate.setHours(0, 0, 0, 0);
      if (domDate < today) return; // Ignora domingos já passados

      let $nomeEl = $(card).find('.card-nome, div[title]').first();
      if ($nomeEl.length === 0) {
        $nomeEl = $(card).find('img.card-avatar').next('div').children('div').first();
      }
      const nome = ($nomeEl.attr('title') || $nomeEl.text() || '').trim();
      if (!nome || !dataBr) return;

      const badgesText = $(card).find('.badge').map((__, b) => $(b).text().trim()).get().join(' ');
      const proximo = /pr[óo]ximo\s+domingo/i.test(badgesText);

      sobreavisoDomingosArr.push({
        nome,
        data: dataBr,
        dataIso,
        proximo,
        _ts: domDate.getTime()
      });
    });

    sobreavisoDomingosArr.sort((a, b) => a._ts - b._ts);
    sobreavisoDomingosArr.forEach((item, idx) => {
      if (idx === 0) item.proximo = true;
      delete item._ts;
    });

    const sobreavisoDomingosHtmlArr = sobreavisoDomingosArr.map(
      item => `<strong>${escapeHtml(item.nome)}</strong> (${escapeHtml(item.data)})`
    );
    const sobreavisoDomingosTextoArr = sobreavisoDomingosArr.map(
      item => `${item.nome} (${item.data})`
    );

    $ausenciasCard.find('table tr').slice(1).each((i, tr) => {
      const row = $(tr).find('td').map((c, td) => $(td).text().trim()).get();
      if (row.length >= 5) {
        const nome = row[0];
        const motivo = row[1];
        const dataInicio = row[2];
        const dataFim = row[4];
        if (nome) {
          // Checa se o evento está ativo hoje (hoje entre Data Início e Data Fim)
          const startDate = parseDateBR(dataInicio);
          const endDate = parseDateBR(dataFim);

          if (startDate) startDate.setHours(0, 0, 0, 0);
          if (endDate) endDate.setHours(23, 59, 59, 999);

          const isAtivoHoje = (startDate ? today >= startDate : true) && (endDate ? today <= endDate : true);
          if (!isAtivoHoje) return; // Ignora eventos que já expiraram ou que ainda não começaram

          const inicioParts = (dataInicio || '').split('/');
          const fimParts = (dataFim || '').split('/');
          const inicioShort = inicioParts.length >= 2 ? `${inicioParts[0]}/${inicioParts[1]}` : dataInicio;
          const fimShort = fimParts.length >= 2 ? `${fimParts[0]}/${fimParts[1]}` : dataFim;

          let periodo = '';
          if (inicioShort && fimShort && inicioShort !== fimShort) {
            periodo = `${inicioShort} a ${fimShort}`;
          } else if (fimShort) {
            periodo = `${fimShort}`;
          } else if (inicioShort) {
            periodo = `${inicioShort}`;
          }

          const motivoStr = motivo ? ` - ${motivo}` : '';
          const periodoStr = periodo ? ` (${periodo})` : '';

          ausenciasArr.push(`${nome}${motivoStr}${periodoStr}`);
          ausenciasHtmlArr.push(`<strong>${escapeHtml(nome)}</strong>${escapeHtml(motivoStr)}${escapeHtml(periodoStr)}`);
        }
      }
    });

    // --- ANIVERSARIANTES DO MÊS ---
    const aniversariantesMes = [];
    const aniversariantesHoje = [];
    const mesAtual = String(today.getMonth() + 1).padStart(2, '0');
    const diaAtual = String(today.getDate()).padStart(2, '0');

    let $equipeTable = null;
    $('.card').each((_, card) => {
      const text = $(card).find('h1, h2, h3, h4, h5, h6, .card-header, .card-title').text().toLowerCase();
      if (text.includes('equipe e jornadas') || text.includes('jornadas cadastradas')) {
        $equipeTable = $(card).find('table');
        return false;
      }
    });

    if ($equipeTable) {
      $equipeTable.find('tr').slice(1).each((i, tr) => {
        const $tds = $(tr).find('td');
        if ($tds.length >= 8) {
          const status = $tds.eq(0).text().trim().toUpperCase();
          const nome = $tds.eq(2).text().trim();
          
          let fotoSrc = $tds.eq(2).find('img').attr('src');
          if (fotoSrc && fotoSrc.startsWith('/')) {
            fotoSrc = 'http://192.168.243.2:8888' + fotoSrc;
          }
          fotoSrc = normalizeTrustedHorariosImageSrc(fotoSrc);

          const nascimento = $tds.eq(7).text().trim(); // DD/MM/YYYY
          if (status === 'ATIVO' && nascimento && nascimento.includes('/')) {
            const parts = nascimento.split('/');
            if (parts.length >= 2) {
              const d = parts[0];
              const m = parts[1];
              if (m === mesAtual) {
                if (d === diaAtual) {
                  aniversariantesHoje.push({ nome, dia: d, foto: fotoSrc });
                } else {
                  aniversariantesMes.push({ nome, dia: d, foto: fotoSrc });
                }
              }
            }
          }
        }
      });
    }

    aniversariantesMes.sort((a, b) => parseInt(a.dia, 10) - parseInt(b.dia, 10));

    const aniversariantesParts = [];
    const aniversariantesTextParts = [];
    
    aniversariantesHoje.forEach(item => {
      const fotoSrc = safeTickerImageSrc(item.foto);
      const imgHtml = fotoSrc ? `<img src="${fotoSrc}" style="width:20px; height:20px; border-radius:50%; vertical-align:middle; margin-right:4px;">` : '';
       aniversariantesParts.push(`<strong style="color: #ffeb3b; display:inline-flex; align-items:center;">Feliz Aniversário, ${imgHtml} ${escapeHtml(item.nome)}!</strong>`);
       aniversariantesTextParts.push(`Feliz Aniversário, ${item.nome}!`);
    });

    aniversariantesMes.forEach(item => {
      const fotoSrc = safeTickerImageSrc(item.foto);
      const imgHtml = fotoSrc ? `<img src="${fotoSrc}" style="width:20px; height:20px; border-radius:50%; vertical-align:middle; margin-right:4px;">` : '';
      aniversariantesParts.push(`<span style="display:inline-flex; align-items:center;">${imgHtml} ${escapeHtml(item.nome)} (${item.dia}/${mesAtual})</span>`);
      aniversariantesTextParts.push(`${item.nome} (${item.dia}/${mesAtual})`);
    });

    const pillAniversariantes = aniversariantesParts.length > 0 
      ? `<span class="ticker-pill pill-aniversariantes" style="display:inline-flex; align-items:center; gap:6px;"><i class="fa-solid fa-gift"></i> <strong>ANIVERSARIANTES DO MÊS:</strong> ${aniversariantesParts.join(' ⬢ ')}</span>`
      : '';
    const textAniversariantes = aniversariantesTextParts.length > 0
       ? ` | ANIVERSARIANTES DO MÊS: ${aniversariantesTextParts.join(' ⬢ ')}`
      : '';
    // --------------------------------

    const turnosStr = turnos.length > 0 ? turnos.join('  ⬢  ') : 'Sem escala cadastrada';
    const sobreavisoStr = sobreavisoArr.length > 0 ? sobreavisoArr.join(', ') : 'Nenhum';
    const apoioFixoStr = apoioFixoArr.length > 0 ? apoioFixoArr.join(', ') : 'Nenhum';
    const ausenciasStr = ausenciasArr.length > 0 ? ausenciasArr.join(' ⬢ ') : 'Nenhuma';
    const ausenciasHtmlStr = ausenciasHtmlArr.length > 0 ? ausenciasHtmlArr.join(' ⬢ ') : 'Nenhuma';

    // Detecta a cor da equipe de plantão no sábado (Amarela ou Verde)
    let equipeCorClass = '';
    const pdfHeader = $('.pdf-header');
    if (pdfHeader.length > 0) {
      const headerClass = (pdfHeader.attr('class') || '').toLowerCase();
      const headerText = pdfHeader.text().toLowerCase();
      if (headerClass.includes('tema-amarela') || headerText.includes('amarela')) {
        equipeCorClass = 'pill-escala-amarela';
      } else if (headerClass.includes('tema-verde') || headerText.includes('verde')) {
        equipeCorClass = 'pill-escala-verde';
      }
    } else {
      const pageText = $('body').text().toLowerCase();
      if (pageText.includes('time amarela')) {
        equipeCorClass = 'pill-escala-amarela';
      } else if (pageText.includes('time verde')) {
        equipeCorClass = 'pill-escala-verde';
      }
    }

    // --- PILLS: só aparecem se tiverem conteúdo real ---
    const pillEscalaClass = equipeCorClass ? `pill-escala ${equipeCorClass}` : 'pill-escala';

    // Escala: só mostra se houver turnos cadastrados
    const pillEscala = turnos.length > 0
      ? `<span class="ticker-pill ${pillEscalaClass}"><i class="fa-solid fa-calendar-days"></i> <strong>SÁBADO (${formattedSatDate}):</strong> ${turnos.map(escapeHtml).join('  ⬢  ')}</span>`
      : '';

    // Sobreaviso: só mostra se houver alguém de sobreaviso
    const pillSobreaviso = sobreavisoArr.length > 0
      ? `<span class="ticker-pill pill-sobreaviso"><i class="fa-solid fa-triangle-exclamation"></i> <strong>SOBREAVISO:</strong> ${sobreavisoArr.map(escapeHtml).join(', ')}</span>`
      : '';

    // Apoio fixo: só mostra se houver alguém de apoio
    const pillApoio = apoioFixoArr.length > 0
      ? `<span class="ticker-pill pill-apoio"><i class="fa-solid fa-wrench"></i> <strong>APOIO FIXO (08h-12h):</strong> ${apoioFixoArr.map(escapeHtml).join(', ')}</span>`
      : '';

    // Sobreaviso aos Domingos (Plantão TEF): só mostra se houver próximos domingos cadastrados
    const pillDomingos = sobreavisoDomingosHtmlArr.length > 0
      ? `<span class="ticker-pill pill-sobreaviso pill-domingo"><i class="fa-solid fa-headset"></i> <strong>SOBREAVISO DOMINGOS (PLANTÃO TEF):</strong> ${sobreavisoDomingosHtmlArr.join(' ⬢ ')}</span>`
      : '';

    // Férias/Ausências: só mostra se houver alguma ausência
    const pillFerias = ausenciasHtmlArr.length > 0
      ? `<span class="ticker-pill pill-ferias"><i class="fa-solid fa-umbrella-beach"></i> <strong>AUSÊNCIAS E FÉRIAS:</strong> ${ausenciasHtmlArr.join(' ⬢ ')}</span>`
      : '';

     // Texto base do ticker, usado quando a versão HTML não está disponível.
     const partsTexto = [];
     if (turnos.length > 0)       partsTexto.push(`SÁBADO (${formattedSatDate}): ${turnos.join('  ⬢  ')}`);
     if (sobreavisoArr.length > 0) partsTexto.push(`SOBREAVISO: ${sobreavisoArr.join(', ')}`);
     if (apoioFixoArr.length > 0)  partsTexto.push(`APOIO FIXO: ${apoioFixoArr.join(', ')}`);
     if (sobreavisoDomingosTextoArr.length > 0) partsTexto.push(`SOBREAVISO DOMINGOS (PLANTÃO TEF): ${sobreavisoDomingosTextoArr.join(' ⬢ ')}`);
     if (ausenciasArr.length > 0)  partsTexto.push(`AUSÊNCIAS E FÉRIAS: ${ausenciasArr.join(' ⬢ ')}`);
    if (textAniversariantes)      partsTexto.push(textAniversariantes.replace(/^\s*\|\s*/, ''));
    // --- EVENTOS EM DESTAQUE ---
    const eventosArr = [];
    $('#secao-eventos .evento-card').each((i, card) => {
      const data_titulo = $(card).find('.evento-cabecalho h4, .evento-cabecalho h3, .evento-cabecalho').first().text().trim();

      // Parse data do titulo (ex: "05/10 - Happy Hour")
      let eventoPassou = false;
      const dateMatch = data_titulo.match(/^(\d{2})\/(\d{2})(?:\/(\d{4}))?/);
      if (dateMatch) {
         const day = parseInt(dateMatch[1], 10);
         const month = parseInt(dateMatch[2], 10);
         const year = dateMatch[3] ? parseInt(dateMatch[3], 10) : new Date().getFullYear();

         const evtDate = new Date(year, month - 1, day);
         const today = new Date();
         today.setHours(0,0,0,0);

         // Se o dia já passou (evtDate < today), marcamos como passou
         if (evtDate < today) {
            eventoPassou = true;
         }
      }

      // Se já passou, não mostra no rodapé
      if (eventoPassou) return;

      const status = $(card).find('.evento-status').text().trim();

      const detalhesArr = [];
      $(card).find('.evento-detalhes span').each((_, span) => {
        detalhesArr.push($(span).text().trim());
      });
      const detalhes = detalhesArr.join(' | ');

      const obs = $(card).find('.evento-observacao-texto').text().trim();

      const participantes = [];
      $(card).find('.evento-participante').each((_, p) => {
        const imgSrc = normalizeTrustedHorariosImageSrc($(p).find('img').attr('src'));
        const $span = $(p).find('span').clone();
        $span.children().remove();
        const nome = $span.text().trim();
        const info = $(p).find('small').text().trim();

        participantes.push({
          nome,
          imgSrc,
          info
        });
      });

      eventosArr.push({ data_titulo, status, detalhes, obs, participantes });
    });

    const pillEventos = eventosArr.length > 0
      ? '<span class="ticker-pill pill-evento"><i class="fa-solid fa-calendar-star"></i> <strong>EVENTO:</strong> ' + eventosArr.map(e => escapeHtml(e.data_titulo)).join(' ⬢ ') + '</span>'
      : '';

    if (eventosArr.length > 0) partsTexto.push('🎉 EVENTO: ' + eventosArr.map(e => e.data_titulo).join(' ⬢ '));

    const baseTickerText = partsTexto.join('  |  ');

    horariosCache = {
      eventos: eventosArr,
      pillEventos: pillEventos,
      formattedDate: formattedSatDate,
      turnos,
      sobreaviso: sobreavisoArr,
      apoioFixo: apoioFixoArr,
      sobreavisoDomingos: sobreavisoDomingosArr,
      domingos: sobreavisoDomingosArr,
      ausencias: ausenciasArr,
      pillEscala,
      pillSobreaviso,
      pillApoio,
      pillDomingos,
      pillSobreavisoDomingos: pillDomingos,
      pillFerias,
      pillAniversariantes,
      aniversariantesHojeData: aniversariantesHoje,
      baseTickerText,
      tickerText: '',
      tickerHtml: ''
    };
    rebuildTicker();
    horariosRetryDelay = 30 * 1000;
    if (horariosRetryTimer) {
      clearTimeout(horariosRetryTimer);
      horariosRetryTimer = null;
    }
    console.log(`[Horarios Scraper] Escala atualizada para ${formattedSatDate}`);
  } catch (err) {
    console.error('[Horarios Scraper] Erro ao processar HTML de horários:', safeError(err));
    scheduleHorariosRetry();
  }
}

// --- INTEGRAÇÃO COM SERVIDOR DE HOSPEDAGENS (SRV-ADS002) ---
let hospedagensCache = {
  items: [],
  tickerHtml: '',
  tickerText: '',
  lastUpdate: null
};

async function fetchHospedagensData() {
  const urlsToTry = [
    'http://srv-ads002:8888/todos?busca=',
    'http://192.168.243.2:8888/todos?busca='
  ];

  let res = null;
  for (const url of urlsToTry) {
    try {
      res = await axios.get(url, { timeout: 6000 });
      if (res && res.data) break;
    } catch (err) {
      // Tenta a próxima URL
    }
  }

  if (!res || !res.data) {
    console.error('[Hospedagens Scraper] Não foi possível conectar ao servidor de hospedagens (srv-ads002 / 192.168.243.2).');
    return;
  }

  try {
    const $ = cheerio.load(res.data);
    const items = [];

    $('.top5-container').each((i, el) => {
      const title = $(el).find('.top5-title').text();
      if (title.includes('Últimos Clientes') || title.includes('Ultimos Clientes')) {
        $(el).find('.top5-item').each((j, item) => {
          const nome = $(item).find('strong').text().trim();
          const spans = $(item).find('span').map((s, sp) => $(sp).text().trim()).get();
          const dbRaw = spans.find(t => t.startsWith('(') && t.endsWith(')')) || '';
          const db = dbRaw.replace(/[()]/g, '').trim();
          const dataStr = spans.find(t => /\d{2}\/\d{2}\/\d{4}/.test(t)) || '';
          const dataShort = dataStr.length >= 5 ? dataStr.slice(0, 5) : dataStr;
          if (nome) {
            items.push({ nome, db, dataShort });
          }
        });
      }
    });

    if (items.length > 0) {
      const itemsHtml = items.map(it => `<strong>${escapeHtml(it.nome)}</strong> <span class="hosp-tag">(${escapeHtml(it.db)} - ${escapeHtml(it.dataShort)})</span>`).join(' ⬢ ');
      const itemsText = items.map(it => `${it.nome} (${it.db} - ${it.dataShort})`).join(' ⬢ ');

      const pillHtml = `<span class="ticker-pill pill-hospedagens"><i class="fa-solid fa-cloud-arrow-up"></i> <strong>NOVAS HOSPEDAGENS:</strong> ${itemsHtml}</span>`;

      hospedagensCache = {
        items,
        tickerHtml: pillHtml,
        tickerText: `NOVAS HOSPEDAGENS: ${itemsText}`,
        lastUpdate: new Date().toISOString()
      };
      console.log(`[Hospedagens Scraper] ${items.length} novos clientes carregados`);

      // Atualiza a montagem do letreiro de forma limpa e sem regex
      rebuildTicker();
    }
  } catch (err) {
    console.error('[Hospedagens Scraper] Erro ao processar HTML:', safeError(err));
  }
}

// --- MONITORAMENTO SEFAZ VIA API PÚBLICA INTEGRANOTAS ---
function emptySefazData(lastUpdate = null) {
  return {
    nfe: { doc: 'NFe', status: 'UNKNOWN', latency: null, state: 'CE', label: 'IntegraNotas' },
    nfce: { doc: 'NFCe', status: 'UNKNOWN', latency: null, state: 'CE', label: 'IntegraNotas' },
    cte: { doc: 'CTe', status: 'UNKNOWN', latency: null, state: 'CE', label: 'IntegraNotas' },
    mdfe: { doc: 'MDFe', status: 'UNKNOWN', latency: null, state: 'CE', label: 'IntegraNotas' },
    lastUpdate
  };
}

let sefazDataCache = emptySefazData();

async function fetchSefazStatus() {
  const documentKeys = ['nfe', 'nfce', 'cte', 'mdfe'];
  const checkedAt = new Date().toISOString();
  const next = emptySefazData();

  try {
    const checks = await fetchPublicSefazStatuses(axios, { uf: 'CE', checkedAt });
    for (const key of documentKeys) {
      const check = checks?.[key];
      if (!check) {
        next[key].detail = 'Resposta ausente do monitor público IntegraNotas';
        continue;
      }
      next[key] = {
        ...next[key],
        ...check,
        doc: next[key].doc,
        state: 'CE',
        label: 'IntegraNotas',
        latency: null
      };
    }
  } catch (err) {
    console.error('[SEFAZ IntegraNotas] Falha inesperada na coleta:', safeError(err));
    for (const key of documentKeys) {
      next[key].detail = 'Não foi possível consultar o monitor público IntegraNotas';
    }
  }

  // A API não fornece timestamp da própria medição; este é o instante real da coleta pelo InfoBoard.
  next.lastUpdate = checkedAt;
  sefazDataCache = next;
}

// Atualiza status da SEFAZ a cada 60 segundos
setInterval(fetchSefazStatus, 60 * 1000);
setTimeout(fetchSefazStatus, 1500);

// Atualiza a cada 5 minutos
setInterval(fetchHorariosData, 5 * 60 * 1000);
setTimeout(fetchHorariosData, 2000);

// Atualiza novas hospedagens a cada 5 minutos
setInterval(fetchHospedagensData, 5 * 60 * 1000);
setTimeout(fetchHospedagensData, 2500);

// Inicia o ciclo de atualizações
setInterval(runUpdateCycle, UPDATE_INTERVAL);
// Executa o primeiro ciclo imediatamente
setTimeout(runUpdateCycle, 1000);

// --- ROTAS DA API ---

// Endpoint principal de dados para o painel de TV (Com trava no-store para desativar cache do navegador na TV)
app.get('/api/data', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const access = getPanelAccess(req);
  if (!access) return res.status(401).json({ error: 'Acesso de leitura disponível somente na rede interna autorizada.' });
  
  if (!lastScrapedData) {
    return res.json(filterPanelData({
      timestamp: new Date().toISOString(),
      status: {
        npx: { authenticated: false, isSimulated: false, error: 'Aguardando primeira coleta NPX' },
        pbx: getPbxConnectionStatus(),
        prix: { ...prixConnectionStatus, isSimulated: false, error: 'Aguardando primeira coleta PrixChat' },
        isSimulated: false
      },
      departments: emptyDepartments(),
      prixchat: { pending: [], agents: [] },
      sefaz: sefazDataCache,
      horarios: horariosCache,
      hospedagens: hospedagensCache
    }, access, DEPARTMENTS));
  }
  const payload = {
    ...lastScrapedData,
    ...(NPX_REQUIRE_SIP_CONFIRMATION ? { departments: Object.fromEntries(
      Object.entries(lastScrapedData.departments || {}).map(([queue, department]) =>
        [queue, { ...department, agents: [...(department.agents || [])], calls: [...(department.calls || [])] }])
    ) } : {}),
    status: { ...lastScrapedData.status, pbx: getPbxConnectionStatus() },
    sefaz: sefazDataCache,
    horarios: horariosCache,
    hospedagens: hospedagensCache
  };
  // Reavalia validade da observacao tambem se um coletor estiver atrasado.
  if (NPX_REQUIRE_SIP_CONFIRMATION) reconcileAgentQueues(payload.departments);
  res.json(filterPanelData(payload, access, DEPARTMENTS));
});

const httpServer = app.listen(PORT, () => {
  console.log('========================================================');
  console.log(`[NPX Integrator Server] Rodando na porta ${PORT}`);
  console.log(`Acesse o Wallboard da TV em: http://localhost:${PORT}`);
  console.log(`Endpoint de Dados: http://localhost:${PORT}/api/data`);
  console.log('========================================================');
});

httpServer.on('error', (err) => {
  console.error(`[NPX Integrator Server] Não foi possível abrir a porta ${PORT}: ${safeError(err)}`);
  // Com a porta ocupada, encerra esta instância para não duplicar os coletores.
  process.exit(1);
});
