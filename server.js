const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Carrega variáveis de ambiente
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const UPDATE_INTERVAL = (process.env.UPDATE_INTERVAL_SECONDS || 5) * 1000;

app.use(cors());
app.use(express.json());
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

async function authenticatePrix() {
  const email = process.env.PRIXCHAT_EMAIL;
  const password = process.env.PRIXCHAT_PASSWORD;
  const backendUrl = process.env.PRIXCHAT_BACKEND || 'https://backapp.prixchat.com.br';
  
  if (!email || !password || email === 'seu_email@empresa.com') {
    throw new Error('Credenciais do PrixChat não configuradas.');
  }
  
  try {
    console.log(`[PrixChat] Tentando autenticar usuário: ${email}...`);
    const res = await axios.post(`${backendUrl}/auth/login`, {
      email,
      password
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    prixSessionToken = res.data.token;
    prixConnectionStatus.authenticated = true;
    prixConnectionStatus.error = null;
    console.log('[PrixChat] Autenticação realizada com sucesso!');
    return prixSessionToken;
  } catch (err) {
    prixConnectionStatus.authenticated = false;
    prixConnectionStatus.error = err.message;
    console.error('[PrixChat] Erro na autenticação:', err.message);
    throw err;
  }
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
  const backendUrl = process.env.PRIXCHAT_BACKEND || 'https://backapp.prixchat.com.br';
  try {
    const res = await axios.get(`${backendUrl}/usersMoments`, {
      headers: {
        'Authorization': `Bearer ${prixSessionToken}`,
        'User-Agent': 'Mozilla/5.0'
      }
    });
    prixConnectionStatus.authenticated = true;
    prixConnectionStatus.error = null;
    return res.data;
  } catch (err) {
    if (err.response && (err.response.status === 401 || err.response.status === 403)) {
      console.log('[PrixChat] Token expirou ou foi invalidado (401/403) no moments. Re-autenticando...');
      await authenticatePrix();
      const res = await axios.get(`${backendUrl}/usersMoments`, {
        headers: {
          'Authorization': `Bearer ${prixSessionToken}`,
          'User-Agent': 'Mozilla/5.0'
        }
      });
      prixConnectionStatus.authenticated = true;
      prixConnectionStatus.error = null;
      return res.data;
    }
    prixConnectionStatus.authenticated = false;
    prixConnectionStatus.error = err.message;
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

// Variável global para armazenar os últimos dados extraídos do PBX
let lastPbxData = {};

// Helper para carregar o mapeamento de analistas dinamicamente
function loadAnalystsMap() {
  try {
    const mapPath = path.join(__dirname, 'analysts_map.json');
    if (fs.existsSync(mapPath)) {
      return JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    }
  } catch (e) {
    console.error('[PBX Integrator] Erro ao carregar analysts_map.json:', e.message);
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

// Agente HTTPS para ignorar erros de certificado TLS auto-assinado do PBX
const pbxHttpsAgent = new https.Agent({ rejectUnauthorized: false });

// Configurações de API do PBX (lidas do .env)
const PBX_BASE_URL = process.env.PBX_BASE_URL || 'https://pbx.nossatelecom.com.br';
const PBX_TOKEN = process.env.PBX_API_TOKEN;
const PBX_KEY = process.env.PBX_API_KEY;

// Monitor direto do PBX via API REST (substitui o Puppeteer)
async function startPbxApiMonitor() {
  if (!PBX_TOKEN || !PBX_KEY) {
    console.error('[PBX API] ERRO: PBX_API_TOKEN ou PBX_API_KEY não encontrado no .env. Monitor PBX desativado.');
    return;
  }

  console.log('[PBX API] Iniciando monitor de API direto (sem navegador)...');

  // Fase 1: Baixa o mapa completo de username -> linha_ip dos dispositivos cadastrados
  let usernamToRamal = {};
  try {
    const devicesUrl = `${PBX_BASE_URL}/api/listDevices/${PBX_TOKEN}/${PBX_KEY}`;
    const devRes = await axios.get(devicesUrl, { httpsAgent: pbxHttpsAgent });
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
    console.error('[PBX API] Erro ao carregar mapa de dispositivos:', err.message);
  }

  // Fase 2: Loop de coleta a cada 5 segundos
  async function collectPbxData() {
    try {
      // Busca dispositivos registrados (online/offline) e chamadas ativas em paralelo
      const [regRes, callsRes] = await Promise.all([
        axios.get(`${PBX_BASE_URL}/api/listDevicesRegistered/${PBX_TOKEN}/${PBX_KEY}`, { httpsAgent: pbxHttpsAgent }),
        axios.get(`${PBX_BASE_URL}/api/onlineCalls/${PBX_TOKEN}/${PBX_KEY}`, { httpsAgent: pbxHttpsAgent })
      ]);

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
            // Quem ligou para quem?
            const srcRamal = String(callInfo.source || '');
            const dstRamal = String(callInfo.destination || '');
            if (srcRamal === ramal) {
              // É originador da chamada (Outbound)
              pbxNumber = dstRamal;
              pbxDirection = 0; // Outbound
            } else {
              // É destino da chamada (Inbound)
              pbxNumber = srcRamal;
              pbxDirection = 1; // Inbound
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
            direction: pbxDirection,
            raw: dev
          };
        });
        lastPbxData = newPbxData;
      }
    } catch (err) {
      console.error('[PBX API] Erro na coleta do loop:', err.message);
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

// Função para fazer o login no painel NPXTech
async function authenticate() {
  const email = process.env.NPX_EMAIL;
  const password = process.env.NPX_PASSWORD;

  if (!email || !password || email === 'seu_email@empresa.com') {
    throw new Error('Credenciais padrão ou ausentes no arquivo .env. Usando modo simulador.');
  }

  console.log(`[NPX Integrator] Tentando autenticar usuário: ${email}...`);
  const jar = new CookieJar();

  try {
    // 1. GET para pegar a página de login e o token de autenticidade (CSRF) do Rails
    const getRes = await axios.get('https://app.npxtech.com.br/users/sign_in', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

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

    const postRes = await axios.post('https://app.npxtech.com.br/users/sign_in', params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': jar.getCookieString(),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400
    });

    jar.parseSetCookie(postRes.headers);
    activeSession = jar;
    connectionStatus.authenticated = true;
    connectionStatus.isSimulated = false;
    connectionStatus.error = null;
    console.log('[NPX Integrator] Autenticação realizada com sucesso!');
    return true;
  } catch (error) {
    connectionStatus.authenticated = false;
    connectionStatus.error = error.message;
    console.error('[NPX Integrator] Erro na autenticação:', error.message);
    throw error;
  }
}

// Helper para fazer requisição GET na API do NPX (JSON) com cookies
async function apiGet(endpoint, params = {}) {
  if (!activeSession.hasCookies()) {
    await authenticate();
  }

  const url = `https://app.npxtech.com.br${endpoint}`;
  
  try {
    const res = await axios.get(url, {
      params,
      headers: {
        'Cookie': activeSession.getCookieString(),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Se o HTML retornado contém o formulário de login, nossa sessão expirou
    if (typeof res.data === 'string' && (res.data.includes('new_user') || res.data.includes('users/sign_in'))) {
      console.log('[NPX Integrator] Sessão expirou. Re-autenticando...');
      await authenticate();
      return apiGet(endpoint, params); // Tenta novamente após re-autenticar
    }

    return res.data;
  } catch (error) {
    console.error(`[NPX Integrator] Erro ao buscar ${endpoint}:`, error.message);
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
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Cache para evitar envio repetido de alertas no Telegram para o mesmo ticket
// Guarda: key -> { id, client, sector, timeSec, notifiedAt }
const notifiedTelegramTickets = new Map();

async function checkAndSendTelegramSlaAlerts(prixchatResult) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const enabled = process.env.ENABLE_TELEGRAM_ALERTS !== 'false';
  const slaLimitSec = parseInt(process.env.TELEGRAM_SLA_LIMIT_SEC || '300', 10);

  if (!enabled || !botToken || !chatId || !prixchatResult) return;

  const now = Date.now();
  const pendingTickets = prixchatResult.pending || [];
  const agentsList = Array.isArray(prixchatResult.agents) 
    ? prixchatResult.agents 
    : (prixchatResult.agents ? Object.values(prixchatResult.agents) : []);

  // 1. Checa tickets na fila de pendentes que estouraram SLA (5 min)
  for (const t of pendingTickets) {
    const ticketKey = t.id ? String(t.id) : `${t.client}_${t.sector}`;

    if (t.timeSec >= slaLimitSec) {
      const info = notifiedTelegramTickets.get(ticketKey) || notifiedTelegramTickets.get(`${t.client}_${t.sector}`);

      // Envia notificação apenas se nunca notificou
      if (!info) {
        const payload = {
          id: t.id,
          client: t.client,
          sector: t.sector,
          timeSec: t.timeSec,
          notifiedAt: now
        };
        notifiedTelegramTickets.set(ticketKey, payload);
        notifiedTelegramTickets.set(`${t.client}_${t.sector}`, payload);

        const mins = Math.floor(t.timeSec / 60);
        const msg = `🚨 <b>ALERTA PRIX:</b>\n${escapeHtml(t.client)}\n${t.sector.toUpperCase()} - ${mins} min na fila`;

        try {
          await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text: msg,
            parse_mode: 'HTML'
          });
          console.log(`[Telegram Bot] Alerta de SLA enviado para ${t.client} (${mins}m na fila)!`);
        } catch (err) {
          console.error('[Telegram Bot] Erro ao enviar alerta:', err.response ? err.response.data : err.message);
        }
      }
    }
  }

  // 2. Checa se algum atendimento que havia gerado alerta de SLA foi assumido por um analista
  for (const agent of agentsList) {
    if (agent.tickets && Array.isArray(agent.tickets)) {
      for (const t of agent.tickets) {
        const ticketKey = t.id ? String(t.id) : `${t.client}_${t.sector}`;
        const info = notifiedTelegramTickets.get(ticketKey) || notifiedTelegramTickets.get(`${t.client}_${t.sector}`);

        if (info) {
          notifiedTelegramTickets.delete(ticketKey);
          notifiedTelegramTickets.delete(`${t.client}_${t.sector}`);

          const waitSec = (info && info.timeSec) ? info.timeSec : (t.timeSec || 0);
          const totalMins = Math.floor(waitSec / 60);
          const msg = `✅ <b>SLA EM ATENDIMENTO:</b>\n${escapeHtml(agent.name)} puxou ${escapeHtml(t.client)}\n${t.sector.toUpperCase()} - ${totalMins} min na fila`;

          try {
            await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              chat_id: chatId,
              text: msg,
              parse_mode: 'HTML'
            });
            console.log(`[Telegram Bot] Confirmação de atendimento assumido enviada: ${agent.name} puxou ${t.client}!`);
          } catch (err) {
            console.error('[Telegram Bot] Erro ao enviar confirmação de atendimento assumido:', err.response ? err.response.data : err.message);
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

    // Executa as requisições do NPX e do PrixChat em paralelo
    const [npxResults, prixMoments] = await Promise.all([
      Promise.all(departmentsArray.map(async ([key, dept]) => {
        if (process.env.LOG_LEVEL === 'debug') console.log(`[NPX Integrator] Coletando dados JSON do monitor: ${dept.name}...`);
        
        // Busca dados concorrentemente para este setor
        const [totals, details, waitCalls] = await Promise.all([
          apiGet('/rates/totals_filter_by_queues.json', { queue: dept.path, queue_type: 'LOG' }),
          apiGet('/rates/details_by_queue.json', { queue: dept.path, queue_type: 'LOG' }),
          apiGet('/rates/wait_calls.json', { queue: dept.path })
        ]);

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

        // 2. Ligações ativas (agentes ocupados com chamadas)
        if (details && details.details) {
          details.details.forEach(agent => {
            const isBusy = agent.status === 2 || agent.src || agent.dst;
            if (isBusy && (agent.src || agent.dst)) {
              calls.push({
                id: `real-act-${agent.code}`,
                client: agent.src || agent.dst || 'Chamada Ativa',
                agent: agent.name,
                time_sec: parseTimeToSeconds(agent.time),
                status: 'Atendimento'
              });
            }
          });
        }

        // Ordena a lista de analistas obtidos reais para manter consistência visual no painel
        const sortedAgents = details && details.details ? [...details.details] : [];
        sortedAgents.sort((a, b) => {
          if (a.status === b.status) return 0;
          if (a.status === 2) return -1;
          if (b.status === 2) return 1;
          if (a.status === 5) return -1;
          if (b.status === 5) return 1;
          return 0;
        });

        // Injeta o status do PBX nos analistas retornados (Para a API Real)
        const pbxData = lastPbxData;
        sortedAgents.forEach(agent => {
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

          // O status do NPX (agent.status) agora será mantido como vem da API real (0 = Offline, 1 = Online, etc)
          // Isso garante que apenas quem está logado no MicroSIP do NPX fique Verde Escuro.

          // Só aplica override do PBX se o analista pertencer a esta fila/setor
          if (dept === key && ramal && pbxData[ramal]) {
            const pbxInfo = pbxData[ramal];
            agent.pbxStatus = pbxInfo.status;
            agent.pbxNumber = pbxInfo.number;
            agent.pbxDuration = pbxInfo.duration;
            agent.pbxDurationStr = pbxInfo.durationStr;
            agent.pbxDirection = pbxInfo.direction;

            // Se o analista NÃO está logado no NPX (00:00:00), zera o status do NPX para seguir 100% o padrão do PBX
            if (!agent.total_loged_time || agent.total_loged_time === "00:00:00") {
              agent.status = 0;
            }
          }
        });

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

        // Recalcula os totais com base no estado final modificado pelo PBX
        let finalBusy = 0;
        let finalPaused = 0;
        let finalFree = 0;
        let finalOnline = 0;

        sortedAgents.forEach(agent => {
          if (agent.status === 2) {
            finalBusy++;
            finalOnline++;
          } else if (agent.status === 5) {
            finalPaused++;
            finalOnline++;
          } else if (agent.status === 1) {
            finalFree++;
            finalOnline++;
          }
        });

        // Reordena para garantir que ocupados fiquem no topo
        sortedAgents.sort((a, b) => {
          if (a.status === b.status) return 0;
          if (a.status === 2) return -1;
          if (b.status === 2) return 1;
          if (a.status === 5) return -1;
          if (b.status === 5) return 1;
          return 0;
        });

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
        console.error('[PrixChat] Erro ao coletar tickets reais de WhatsApp:', err.message);
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
        prix: {
          authenticated: prixConnectionStatus.authenticated,
          isSimulated: prixConnectionStatus.isSimulated,
          error: prixConnectionStatus.error
        },
        isSimulated: connectionStatus.isSimulated
      },
      departments: deptsData,
      prixchat: prixchatResult
    };

    // Aciona verificação automática de alertas de SLA para o Telegram
    checkAndSendTelegramSlaAlerts(formattedPrix.pending);
  } catch (err) {
    console.error('[NPX Integrator] Erro no ciclo de atualização, usando dados simulados de fallback:', err.message);
    connectionStatus.error = err.message;
    connectionStatus.authenticated = false;

    const simulatedFallback = generateSimulatedData();
    simulatedFallback.status = {
      npx: {
        authenticated: false,
        isSimulated: true,
        error: err.message
      },
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

// --- INTEGRAÇÃO COM PORTAL DE HORÁRIOS E ESCALAS (SRV-ADS002) ---
let horariosCache = null;

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

async function fetchHorariosData() {
  const satDate = getNextSaturdayString();
  const [yyyy, mm, dd] = satDate.split('-');
  const formattedSatDate = `${dd}/${mm}/${yyyy}`;

  try {
    const url = `http://srv-ads002:8888/horarios?data_filtro_sabado=${satDate}`;
    const res = await axios.get(url, { timeout: 5000 });
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

    // Filtra férias ativas (somente quem ainda NÃO retornou)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const ausenciasArr = [];
    $('.card').eq(2).find('tr').slice(1).each((i, tr) => {
      const row = $(tr).find('td').map((c, td) => $(td).text().trim()).get();
      if (row.length >= 6) {
        const nome = row[0];
        const motivo = row[1];
        const dataFim = row[4];
        if (motivo.toLowerCase().includes('férias') || motivo.toLowerCase().includes('ferias')) {
          const parts = dataFim.split('/');
          if (parts.length === 3) {
            const endDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
            endDate.setHours(23, 59, 59, 999);
            if (endDate >= today) {
              ausenciasArr.push(`${nome} (até ${dataFim})`);
            }
          }
        }
      }
    });

    const turnosStr = turnos.length > 0 ? turnos.join('  •  ') : 'Sem escala cadastrada';
    const sobreavisoStr = sobreavisoArr.length > 0 ? sobreavisoArr.join(', ') : 'Nenhum';
    const apoioFixoStr = apoioFixoArr.length > 0 ? apoioFixoArr.join(', ') : 'Nenhum';
    const ausenciasStr = ausenciasArr.length > 0 ? ausenciasArr.join(', ') : 'Nenhuma';

    const pillEscala = `<span class="ticker-pill pill-escala"><i class="fa-solid fa-calendar-days"></i> <strong>SÁBADO (${formattedSatDate}):</strong> ${turnosStr}</span>`;
    const pillSobreaviso = `<span class="ticker-pill pill-sobreaviso"><i class="fa-solid fa-triangle-exclamation"></i> <strong>SOBREAVISO:</strong> ${sobreavisoStr}</span>`;
    const pillApoio = `<span class="ticker-pill pill-apoio"><i class="fa-solid fa-wrench"></i> <strong>APOIO FIXO (08h-12h):</strong> ${apoioFixoStr}</span>`;
    const pillFerias = `<span class="ticker-pill pill-ferias"><i class="fa-solid fa-umbrella-beach"></i> <strong>FÉRIAS ATIVAS:</strong> ${ausenciasStr}</span>`;

    const tickerHtml = `${pillEscala} ${pillSobreaviso} ${pillApoio} ${pillFerias}`;
    const fullTicker = `📅 ESCALA DE SÁBADO (${formattedSatDate}): ${turnosStr}  |  🚨 SOBREAVISO: ${sobreavisoStr}  |  🛠️ APOIO FIXO: ${apoioFixoStr}  |  🏖️ FÉRIAS ATIVAS: ${ausenciasStr}`;

    horariosCache = {
      formattedDate: formattedSatDate,
      turnos,
      sobreaviso: sobreavisoArr,
      apoioFixo: apoioFixoArr,
      ausencias: ausenciasArr,
      tickerText: fullTicker,
      tickerHtml: tickerHtml
    };
    console.log(`[Horarios Scraper] Escala atualizada para ${formattedSatDate}`);
  } catch (err) {
    console.error('[Horarios Scraper] Erro ao buscar dados:', err.message);
  }
}

// Atualiza a cada 5 minutos
setInterval(fetchHorariosData, 5 * 60 * 1000);
setTimeout(fetchHorariosData, 2000);

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
  
  if (!lastScrapedData) {
    return res.json(generateSimulatedData());
  }
  const payload = { ...lastScrapedData, horarios: horariosCache };
  res.json(payload);
});

// Endpoint de depuração para salvar o HTML real dos monitores no servidor (desabilitado em produção)
app.get('/api/debug/save-html', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Endpoint de depuração desabilitado em produção.' });
  }

  const results = [];
  const debugDir = path.join(__dirname, 'debug_html');

  try {
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir);
    }

    if (!process.env.NPX_EMAIL || process.env.NPX_EMAIL === 'seu_email@empresa.com') {
      return res.status(400).json({ 
        error: 'Você precisa configurar as credenciais reais no arquivo .env antes de usar a rota de depuração.' 
      });
    }

    for (const [key, dept] of Object.entries(DEPARTMENTS)) {
      console.log(`[NPX Debug] Salvando HTML real do monitor: ${dept.name}...`);
      
      // Salva tanto o HTML bruto da página do monitor
      const url = `https://app.npxtech.com.br/rates/${dept.path}/monitor`;
      const pageRes = await axios.get(url, {
        headers: {
          'Cookie': activeSession.getCookieString(),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      const htmlFilename = `debug_monitor_${key}.html`;
      const htmlFilepath = path.join(debugDir, htmlFilename);
      fs.writeFileSync(htmlFilepath, pageRes.data);

      // Salva os JSONs originais também para depuração completa
      const totals = await apiGet('/rates/totals_filter_by_queues.json', { queue: dept.path, queue_type: 'LOG' });
      const details = await apiGet('/rates/details_by_queue.json', { queue: dept.path, queue_type: 'LOG' });
      const waitCalls = await apiGet('/rates/wait_calls.json', { queue: dept.path });

      fs.writeFileSync(path.join(debugDir, `debug_json_totals_${key}.json`), JSON.stringify(totals, null, 2));
      fs.writeFileSync(path.join(debugDir, `debug_json_details_${key}.json`), JSON.stringify(details, null, 2));
      fs.writeFileSync(path.join(debugDir, `debug_json_wait_${key}.json`), JSON.stringify(waitCalls, null, 2));

      results.push({ department: dept.name, filename: htmlFilename, savedPath: htmlFilepath });
    }

    res.json({
      message: 'HTMLs e JSONs de depuração salvos com sucesso na pasta debug_html!',
      savedFiles: results
    });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao salvar HTML/JSON de depuração: ' + err.message });
  }
});

// Endpoint para testar o login
app.post('/api/test-login', async (req, res) => {
  try {
    const success = await authenticate();
    res.json({ success: true, message: 'Autenticado com sucesso no NPXTech!' });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('========================================================');
  console.log(`[NPX Integrator Server] Rodando na porta ${PORT}`);
  console.log(`Acesse o Wallboard da TV em: http://localhost:${PORT}`);
  console.log(`Endpoint de Dados: http://localhost:${PORT}/api/data`);
  console.log(`Endpoint de Depuração HTML: http://localhost:${PORT}/api/debug/save-html`);
  console.log('========================================================');
});
