// Configurações e Estado Global do Frontend
const CONFIG = {
  limits: {
    queue: { warning: 2, critical: 4 },
    wait: { warning: 180, critical: 300 } // em segundos
  },
  updateInterval: 3000 // atualiza a cada 3 segundos
};
let previousTotalQueue = 0;
const escapePanelHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeChatSector = sector => {
  const value = String(sector ?? '').toLowerCase();
  return ['suporte', 'comercial', 'financeiro', 'sped'].includes(value) ? value : 'outros';
};
let chatCarouselIndex = 0; // Controla qual página de atendentes do chat está ativa
let lastChatData = null; // Armazena a última resposta real obtida do PrixChat
// Agrupamento por Slots (0 = Esquerda, 1 = Centro, 2 = Direita) e Modos de Exibição
function readChatPreference(key, fallback) {
  try {
    return InfoBoardChatSlots.parseStoredObject(localStorage.getItem(key), fallback);
  } catch {
    return fallback; // Storage indisponível: inicia com preferências padrão.
  }
}
let chatSlotGroups = InfoBoardChatSlots.normalizeGroups(readChatPreference('chat_slot_groups', {}));
let chatAnalystViewModes = readChatPreference('chat_analyst_view_modes', {});
let pinPendingAlways = false; // Se verdadeiro, mantém a coluna de pendentes visível mesmo vazia
let carouselPaused = false; // Controla se o carrossel está pausado
let chatDragInProgress = false; // Mantém o DOM estável durante arraste de colunas
let chatDraggedAnalystName = null;
let expandedAnalysts = new Set(); // Armazena as chaves dos analistas com card expandido por clique

function saveChatSlotGroups() {
  try {
    localStorage.setItem('chat_slot_groups', JSON.stringify(chatSlotGroups));
  } catch {
    // O painel segue funcionando em navegadores com armazenamento desabilitado.
  }
}

// Função para alternar modo compacto / detalhado de um analista
window.toggleAnalystViewMode = function(name, e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  // Se não estiver definido, o padrão visual era 'full' para isolados e 'compact' para agrupados.
  // Vamos inverter o estado salvo na memória. Se não tem nada salvo, assumimos que ele quer mudar para compact
  const currentMode = chatAnalystViewModes[name] || 'full'; 
  chatAnalystViewModes[name] = currentMode === 'compact' ? 'full' : 'compact';
  localStorage.setItem('chat_analyst_view_modes', JSON.stringify(chatAnalystViewModes));
  renderPrixChat(lastChatData);
};

// Função para fixar/desafixar analista (compatível com slots)
window.togglePinAgent = function(name, e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  let foundInSlot = -1;
  for (let s in chatSlotGroups) {
    if (chatSlotGroups[s] && chatSlotGroups[s].includes(name)) {
      foundInSlot = parseInt(s);
      break;
    }
  }

  if (foundInSlot > -1) {
    // Desafixa: remove do slot e volta ao carrossel rotativo
    chatSlotGroups[foundInSlot] = chatSlotGroups[foundInSlot].filter(n => n !== name);
  } else {
    // Fixa no primeiro slot vago ou no slot 0
    let targetSlot = 0;
    for (let s = 0; s < 3; s++) {
      if (!chatSlotGroups[s] || chatSlotGroups[s].length === 0) {
        targetSlot = s;
        break;
      }
    }
    if (!chatSlotGroups[targetSlot]) chatSlotGroups[targetSlot] = [];
    chatSlotGroups[targetSlot].push(name);
  }

  saveChatSlotGroups();
  renderPrixChat(lastChatData);
};

// --- DRAG & DROP DE ANALISTAS DO CHAT (AGRUPAMENTO POR COLUNA) ---
window.handleChatDragStart = function(e, analystName) {
  chatDragInProgress = true;
  chatDraggedAnalystName = analystName;
  e.dataTransfer.setData('text/plain', analystName);
  e.dataTransfer.effectAllowed = 'move';
  const col = e.target.closest('.chat-column');
  if (col) {
    setTimeout(() => {
      if (chatDragInProgress && col.isConnected) col.classList.add('chat-dragging');
    }, 0);
  }
};

window.handleChatDragEnd = function(e) {
  document.querySelectorAll('.chat-dragging').forEach(el => el.classList.remove('chat-dragging'));
  document.querySelectorAll('.chat-drag-over').forEach(el => el.classList.remove('chat-drag-over'));
  chatDraggedAnalystName = null;
  if (chatDragInProgress) {
    chatDragInProgress = false;
    renderPrixChat(lastChatData);
  }
};

window.handleChatDragOver = function(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.currentTarget;
  if (target && !target.classList.contains('chat-drag-over')) {
    target.classList.add('chat-drag-over');
  }
};

window.handleChatDragLeave = function(e) {
  const target = e.currentTarget;
  if (target) {
    target.classList.remove('chat-drag-over');
  }
};

window.handleChatDrop = function(e, slotIndex, targetAnalystName) {
  e.preventDefault();
  e.stopPropagation();
  document.querySelectorAll('.chat-drag-over').forEach(el => el.classList.remove('chat-drag-over'));
  document.querySelectorAll('.chat-dragging').forEach(el => el.classList.remove('chat-dragging'));

  const draggedName = e.dataTransfer.getData('text/plain');
  if (!draggedName || draggedName !== chatDraggedAnalystName) return;
  if (!lastChatData?.agents?.some(agent => agent.name === draggedName && agent.tickets?.length > 0)) return;
  if (targetAnalystName && !lastChatData.agents.some(agent => agent.name === targetAnalystName && agent.tickets?.length > 0)) return;
  chatDragInProgress = false;
  chatDraggedAnalystName = null;

  const showPending = (lastChatData.pending?.length || 0) > 0 || pinPendingAlways;
  const nextGroups = InfoBoardChatSlots.applyDropToGroups(
    chatSlotGroups, draggedName, slotIndex, targetAnalystName, showPending
  );
  if (JSON.stringify(nextGroups) !== JSON.stringify(chatSlotGroups)) {
    chatSlotGroups = nextGroups;
    saveChatSlotGroups();
  }
  renderPrixChat(lastChatData);
};

// Função para fixar/desafixar a exibição de pendentes
window.togglePinPending = function() {
  pinPendingAlways = !pinPendingAlways;
  renderPrixChat(lastChatData);
};

// Função para pausar/retomar o carrossel de analistas do chat
window.toggleCarousel = function() {
  carouselPaused = !carouselPaused;
  const icon = document.getElementById('carousel-toggle-icon');
  const btn  = document.getElementById('carousel-toggle-btn');
  if (carouselPaused) {
    icon.className = 'fa-solid fa-play';
    btn.title = 'Retomar carrossel';
    btn.classList.add('paused');
  } else {
    icon.className = 'fa-solid fa-pause';
    btn.title = 'Pausar carrossel';
    btn.classList.remove('paused');
  }
};

// Inicializa a aplicação
document.addEventListener('DOMContentLoaded', () => {
  startClock();
  loadColumnOrder(); // Restaura a ordem das colunas salva pelo usuário
  initDragAndDrop(); // Ativa o suporte a arrastar e soltar (Drag and Drop)
  fetchData();
  
  // Ciclo principal de atualização
  setInterval(fetchData, CONFIG.updateInterval);

  // Previne congelamento quando a aba fica em 2º plano no modo "Projetar Tela" do Windows
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      fetchData();
    }
  });

  window.addEventListener('focus', () => {
    fetchData();
  });

  // Roda a transição de analistas do PrixChat (carrossel) a cada 8 segundos
  setInterval(() => {
    if (chatDragInProgress) return;
    const chatData = lastChatData || { pending: [], agents: [] };
    const pendingCount = chatData.pending ? chatData.pending.length : 0;
    const showPending = pendingCount > 0 || pinPendingAlways;

    const busyAgents = chatData.agents ? chatData.agents.filter(a => a.tickets && a.tickets.length > 0) : [];
    const layout = InfoBoardChatSlots.getVisibleLayout(chatSlotGroups, busyAgents, showPending);

    let maxPages = 1;
    if (layout.freeSlots.length > 0 && layout.rotatingAgents.length > 0) {
      maxPages = Math.ceil(layout.rotatingAgents.length / layout.freeSlots.length) || 1;
    }

    if (!carouselPaused) {
      if (maxPages > 1) {
        chatCarouselIndex = (chatCarouselIndex + 1) % maxPages;
      } else {
        chatCarouselIndex = 0;
      }
    }
    renderPrixChat(lastChatData); // Transita usando sempre os dados reais obtidos
  }, 8000);
});

// Relógio digital em tempo real no cabeçalho e no letreiro fixo
function startClock() {
  const clockEl = document.getElementById('live-clock') || document.getElementById('current-time');
  const dateEl = document.getElementById('live-date') || document.getElementById('current-date');
  const tickerTimeEl = document.getElementById('ticker-time');
  const tickerDateEl = document.getElementById('ticker-date');
  
  const updateTime = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR');
    const options = { day: '2-digit', month: 'short', year: 'numeric' };
    const dateStr = now.toLocaleDateString('pt-BR', options).toUpperCase();

    if (clockEl) clockEl.textContent = timeStr;
    if (dateEl) dateEl.textContent = dateStr;
    if (tickerTimeEl) tickerTimeEl.textContent = timeStr;
    if (tickerDateEl) tickerDateEl.textContent = dateStr;
  };
  
  updateTime();
  setInterval(updateTime, 1000);
}

// Busca os dados do servidor local (sempre forçando requisição nova sem cache)
async function fetchData() {
  try {
    const response = await fetch(`/api/data?t=${Date.now()}`, { cache: 'no-store' });
    if (response.status === 401) {
      // Ao perder acesso à rede interna, limpe os dados exibidos.
      lastChatData = null;
      const emptyDept = () => ({ queue: 0, wait_time_sec: 0, agents: [], calls: [], agents_online: 0 });
      updateUI({
        status: { npx: { authenticated: false }, pbx: { authenticated: false }, prix: { authenticated: false } },
        departments: {
          InfoBrasil_Comercial: emptyDept(), Infobrasil_finan: emptyDept(),
          InfoBrasil_SPED_Fiscal: emptyDept(), InfoBrasil_Suporte: emptyDept(),
          InfoBrasil_Ponto: emptyDept()
        },
        prixchat: { pending: [], agents: [] }, horarios: null, hospedagens: null
      });
      setConnectionStatus('npx', 'offline', 'ACESSO RESTRITO');
      const banner = document.getElementById('npx-alert-banner');
      const bannerText = document.getElementById('npx-alert-message');
      if (banner) { banner.className = 'npx-alert-banner'; banner.style.display = 'flex'; }
      if (bannerText) bannerText.textContent = 'Acesso à leitura permitido somente na rede interna autorizada.';
      return;
    }
    if (!response.ok) throw new Error('Erro na resposta do integrador');
    
    const data = await response.json();
    lastChatData = data.prixchat; // Persiste os dados reais de chat na variável global
    updateUI(data);
  } catch (error) {
    console.error('[Wallboard TV] Falha ao obter dados:', error);
    setConnectionStatus('npx', 'offline', 'NPX Off');
    setConnectionStatus('pbx', 'offline', 'PBX Off');
    setConnectionStatus('prix', 'offline', 'PRIX Off');
  }
}

// Atualiza o Status de Conexão no Cabeçalho e no Rodapé (Visíveis no F11)
function setConnectionStatus(service, type, label) {
  // Badges do Header
  const indicator = document.getElementById(`connection-status-${service}`);
  const statusText = document.getElementById(`status-text-${service}`);
  if (indicator && statusText) {
    indicator.className = 'status-indicator ' + type;
    statusText.textContent = label;
  }

  // Badges do Rodapé (Visíveis no F11)
  const tickerIndicator = document.getElementById(`connection-status-${service}-ticker`);
  const tickerText = document.getElementById(`status-text-${service}-ticker`);
  if (tickerIndicator && tickerText) {
    tickerIndicator.className = 'status-indicator ' + type + ' ticker-status-pill';
    tickerText.textContent = label;
  }
}

// Utilitário para formatar segundos em MM:SS ou HH:MM:SS
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  const pad = (num) => String(num).padStart(2, '0');
  
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

// Beep sonoro sintetizado nativo (Web Audio API)
function playQueueBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const playTone = (freq, duration, delay) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
      
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + duration);
      
      osc.start(audioCtx.currentTime + delay);
      osc.stop(audioCtx.currentTime + delay + duration);
    };

    playTone(784, 0.2, 0);     // Sol (G5)
    playTone(1046, 0.25, 0.12); // Dó (C6)
  } catch (e) {
    console.warn('[Audio] Não foi possível reproduzir som:', e);
  }
}

// --- ARRASTAR E SOLTAR (DRAG AND DROP) DE BLOCOS DE VOZ ---

function initDragAndDrop() {
  const zones = document.querySelectorAll('.voice-zone');
  const columns = document.querySelectorAll('.dept-column');
  
  columns.forEach(column => {
    column.addEventListener('dragstart', (e) => {
      column.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    
    column.addEventListener('dragend', () => {
      column.classList.remove('dragging');
      saveColumnOrder(); // Salva a nova disposição
    });
  });
  
  zones.forEach(zone => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
      
      const draggingEl = document.querySelector('.dragging');
      if (!draggingEl) return;
      
      const siblings = [...zone.querySelectorAll('.dept-column:not(.dragging)')];
      
      const nextSibling = siblings.find(sibling => {
        const box = sibling.getBoundingClientRect();
        return e.clientY <= box.top + box.height / 2;
      });
      
      if (nextSibling) {
        zone.insertBefore(draggingEl, nextSibling);
      } else {
        zone.appendChild(draggingEl);
      }
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', () => {
      zone.classList.remove('drag-over');
    });
  });
}

// Salva a distribuição dos dois blocos nas duas zonas de voz
function saveColumnOrder() {
  const zone1 = document.getElementById('zone-1');
  const zone2 = document.getElementById('zone-2');
  if (!zone1 || !zone2) return;
  
  const layoutState = {
    zone1: [...zone1.querySelectorAll('.dept-column')].map(col => col.id),
    zone2: [...zone2.querySelectorAll('.dept-column')].map(col => col.id)
  };
  
  localStorage.setItem('npx-column-order-v5', JSON.stringify(layoutState));
  console.log('[Wallboard TV] Disposição dos blocos de voz salva:', layoutState);
}

// Restaura a distribuição dos dois blocos nas duas zonas de voz
function loadColumnOrder() {
  try {
    const savedOrder = localStorage.getItem('npx-column-order-v5');
    if (!savedOrder) return;
    
    const layoutState = JSON.parse(savedOrder);
    const zone1 = document.getElementById('zone-1');
    const zone2 = document.getElementById('zone-2');
    
    if (layoutState.zone1) {
      layoutState.zone1.forEach(id => {
        const col = document.getElementById(id);
        if (col && zone1) zone1.appendChild(col);
      });
    }
    
    if (layoutState.zone2) {
      layoutState.zone2.forEach(id => {
        const col = document.getElementById(id);
        if (col && zone2) zone2.appendChild(col);
      });
    }
    console.log('[Wallboard TV] Disposição dos blocos de voz carregada.');
  } catch (e) {
    console.error('[Wallboard TV] Erro ao carregar disposição dos blocos de voz:', e);
  }
}

// --- DADOS SIMULADOS DE SUPORTE DO PRIXCHAT (WHATSAPP) ---
const mockPrixChatData = {
  pending: [
    { client: 'Eva taynara', msg: '"Wendel Almeida" poderia me d...', time: '13:01', sector: 'suporte', timeSec: 780 },
    { client: 'Marcelo ISA HOME', msg: '46256596002156...', time: '12:55', sector: 'comercial', timeSec: 1140 }
  ],
  agents: [
    {
      name: 'Alisson Neves',
      tickets: [
        { client: 'Jefferson Inspetor', msg: '"Alisson Neves": Boa tarde...', time: '12:00', sector: 'suporte', timeSec: 4400 }
      ]
    },
    {
      name: 'Anndro Nantua',
      tickets: [
        { client: 'AG MOVEIS', msg: 'O pessoal da contabilidade...', time: '12:21', sector: 'suporte', timeSec: 3100 },
        { client: 'Rochelle PISCI.', msg: 'Pronto', time: '04/08', sector: 'suporte', timeSec: 86400 }
      ]
    },
    {
      name: 'Bruno Carvalho',
      tickets: [
        { client: 'HELOISA CIDAGRO', msg: 'Bruno precisava saber...', time: '13:00', sector: 'suporte', timeSec: 800 }
      ]
    },
    {
      name: 'Carol Queiroz',
      tickets: [
        { client: 'Gessica Maria', msg: 'Cuidar...', time: '12:07', sector: 'sped', timeSec: 3900 },
        { client: 'Escritório Pão', msg: 'Certo', time: '05/08', sector: 'suporte', timeSec: 86400 }
      ]
    },
    {
      name: 'Darkison Bandeira',
      tickets: [
        { client: 'Luanne', msg: 'Bom dia', time: '08:47', sector: 'suporte', timeSec: 16000 },
        { client: 'Vilcar Financeiro', msg: 'Bom dia', time: '05/08', sector: 'financeiro', timeSec: 86400 },
        { client: 'Isaque Rock.', msg: 'Fico no teu aguardo...', time: '04/08', sector: 'suporte', timeSec: 86400 },
        { client: 'Francisco 👦', msg: 'documento', time: '04/08', sector: 'suporte', timeSec: 86400 }
      ]
    },
    {
      name: 'Edson Cavalcante',
      tickets: [
        { client: 'Djayna', msg: 'ok', time: '10:48', sector: 'suporte', timeSec: 8800 }
      ]
    },
    {
      name: 'Igor Silva',
      tickets: [
        { client: 'Estefane - Rihomo', msg: 'Boa tarde, a Car...', time: '12:48', sector: 'suporte', timeSec: 1500 },
        { client: 'Rita Fernandes', msg: 'Tranquilo, estou...', time: '12:48', sector: 'suporte', timeSec: 1500 }
      ]
    }
  ]
};

// Renderiza o painel do PrixChat na metade direita da tela
function renderPrixChat(realData) {
  const container = document.getElementById('chat-kanban-board');
  if (!container) return;
  if (chatDragInProgress) return;
  
  // Não exibir atendimentos de demonstração quando o PrixChat estiver sem dados.
  const chatData = realData || { pending: [], agents: [] };
  
  const pendingCount = chatData.pending ? chatData.pending.length : 0;
  let activeCount = 0;
  
  if (chatData.agents) {
    chatData.agents.forEach(a => {
      activeCount += a.tickets ? a.tickets.length : 0;
    });
  }
  
  // Contagem de ativos no cabeçalho; pendentes já aparece na coluna própria.
  document.getElementById('chat-summary-count').textContent = `${activeCount} Ativos`;
  container.innerHTML = '';
  
  const showPending = pendingCount > 0 || pinPendingAlways;
  const analystSlotsCount = showPending ? 2 : 3;

  // 1. Coluna de Pendentes (Só aparece se houver atendimento na fila ou se estiver fixada)
  if (showPending) {
    const pendingCol = document.createElement('div');
    pendingCol.className = 'chat-column';
    
    const isPendingPinned = pinPendingAlways;
    const pendingPinIconClass = isPendingPinned ? 'fa-solid fa-thumbtack pinned-active' : 'fa-solid fa-thumbtack';
    const pendingPinTitle = isPendingPinned ? 'Ocultar quando estiver vazio' : 'Manter sempre visível (Fixar)';

    pendingCol.innerHTML = `
      <div class="chat-column-header pending">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="chat-pin-btn" onclick="togglePinPending()" title="${pendingPinTitle}">
            <i class="${pendingPinIconClass}"></i>
          </button>
          <span>Pendentes</span>
        </div>
        <span class="online-badge" style="background:#ffffff; color:#dc2626;">${pendingCount}</span>
      </div>
      <div class="chat-cards-container" id="chat-pending-cards"></div>
    `;
    container.appendChild(pendingCol);
    
    const pendingCardsContainer = pendingCol.querySelector('#chat-pending-cards');
      if (chatData.pending) {
        chatData.pending.forEach(t => {
          const card = document.createElement('div');
          const isSlaAlert = t.timeSec > 300; // 5 minutos na fila de espera
          const sector = safeChatSector(t.sector);
          card.className = 'chat-kanban-card' + (isSlaAlert ? ' alert-card-sla' : '');
          card.innerHTML = `
          <span class="chat-kanban-client">${escapePanelHtml(t.client)}</span>
          <span class="chat-kanban-snippet">${escapePanelHtml(t.msg)}</span>
          <div class="chat-kanban-meta">
            <span class="chat-kanban-time ${isSlaAlert ? 'alert' : ''}">${escapePanelHtml(t.time)}</span>
            <span class="chat-kanban-sector ${sector}">${sector.toUpperCase()}</span>
          </div>
        `;
        pendingCardsContainer.appendChild(card);
      });
    }
  }
  
  // 2. Colunas de Agentes com suporte a Drag & Drop, Fixação em Slots e Carrossel rotativo
  const busyAgents = chatData.agents ? [...chatData.agents]
    .filter(a => a.tickets && a.tickets.length > 0)
    .sort((a, b) => b.tickets.length - a.tickets.length) : [];

  // Criação do elemento de coluna do analista (compatível com modo compacto ou completo)
  function createAnalystColumnElement(agent, isCompact, isPinned, slotIndex, isGrouped) {
    const col = document.createElement('div');
    col.className = 'chat-column' + (agent.online === false ? ' offline' : '') + (isPinned ? ' pinned-active' : '');
    col.draggable = true;
    col.addEventListener('dragstart', e => handleChatDragStart(e, agent.name));
    col.addEventListener('dragend', handleChatDragEnd);
    col.addEventListener('dragover', handleChatDragOver);
    col.addEventListener('dragleave', handleChatDragLeave);
    col.addEventListener('drop', e => handleChatDrop(e, slotIndex, agent.name));

    const pinIconClass = isPinned ? 'fa-solid fa-thumbtack pinned-active' : 'fa-solid fa-thumbtack';
    const pinTitle = isPinned ? 'Desafixar coluna (voltar ao carrossel)' : 'Fixar nesta coluna';
    const modeTitle = isCompact ? 'Mudar para cartões completos' : 'Agrupar em lista compacta';
    const modeIcon = isCompact ? 'fa-table-cells-large' : 'fa-list-ul';

    col.innerHTML = `
      <div class="chat-column-header">
        <div style="display: flex; align-items: center; gap: 6px;">
          <button class="chat-pin-btn" title="${pinTitle}">
            <i class="${pinIconClass}"></i>
          </button>
          <button class="chat-view-mode-btn ${isCompact ? 'active' : ''}" title="${modeTitle}">
            <i class="fa-solid ${modeIcon}"></i>
          </button>
          <span class="chat-header-name" title="Clique e arraste para agrupar em outra coluna">${escapePanelHtml(agent.name)}</span>
        </div>
        <span class="online-badge" style="background:rgba(255,255,255,0.25); color:white;">${agent.tickets ? agent.tickets.length : 0}</span>
      </div>
      <div class="chat-cards-container ${isGrouped ? 'pinned-cards-container' : ''}"></div>
    `;
    col.querySelector('.chat-pin-btn').addEventListener('click', e => togglePinAgent(agent.name, e));
    col.querySelector('.chat-view-mode-btn').addEventListener('click', e => toggleAnalystViewMode(agent.name, e));

    const cardsContainer = col.querySelector('.chat-cards-container');
    const tickets = agent.tickets || [];

    // Ordena tickets por tempo (maior tempo / maior urgência primeiro)
    const sortedTickets = [...tickets].sort((a, b) => {
      if (b.timeSec !== undefined && a.timeSec !== undefined) {
        return b.timeSec - a.timeSec;
      }
      return (a.time || '').localeCompare(b.time || '');
    });

    sortedTickets.forEach(t => {
      const isSlaAlert = t.timeSec > 1800; // 30 minutos em atendimento sem interação
      const sector = safeChatSector(t.sector);
      const card = document.createElement('div');

      if (isCompact) {
        card.className = 'chat-compact-card' + (isSlaAlert ? ' alert-card-sla' : '');
        card.title = `${t.client} | ${t.msg || 'Sem mensagens recentes'}`;
        card.innerHTML = `
          <span class="chat-compact-client" title="${escapePanelHtml(t.client)}">${escapePanelHtml(t.client)}</span>
          <span class="chat-compact-time ${isSlaAlert ? 'alert' : ''}">${escapePanelHtml(t.time)}</span>
          <span class="chat-compact-sector ${sector}">${sector.toUpperCase()}</span>
        `;
      } else {
        card.className = 'chat-kanban-card' + (isSlaAlert ? ' alert-card-sla' : '');
        card.innerHTML = `
          <span class="chat-kanban-client">${escapePanelHtml(t.client)}</span>
          <span class="chat-kanban-snippet">${escapePanelHtml(t.msg)}</span>
          <div class="chat-kanban-meta">
            <span class="chat-kanban-time ${isSlaAlert ? 'alert' : ''}">${escapePanelHtml(t.time)}</span>
            <span class="chat-kanban-sector ${sector}">${sector.toUpperCase()}</span>
          </div>
        `;
      }
      cardsContainer.appendChild(card);
    });

    return col;
  }

  const chatLayout = InfoBoardChatSlots.getVisibleLayout(chatSlotGroups, busyAgents, showPending);
  const availableRotatingAgents = chatLayout.rotatingAgents;
  const freeSlots = chatLayout.freeSlots;

  // Distribuição do carrossel rotativo para os slots livres
  let rotatingAgentsDistribution = {};
  if (freeSlots.length > 0 && availableRotatingAgents.length > 0) {
    const totalRemaining = availableRotatingAgents.length;
    const maxPages = Math.ceil(totalRemaining / freeSlots.length) || 1;
    if (chatCarouselIndex >= maxPages) {
      chatCarouselIndex = 0;
    }
    const startIdx = (chatCarouselIndex * freeSlots.length) % totalRemaining;
    freeSlots.forEach((slotIdx, i) => {
      const agentCandidate = availableRotatingAgents[(startIdx + i) % totalRemaining];
      if (agentCandidate) {
        rotatingAgentsDistribution[slotIdx] = agentCandidate;
      }
    });
  }

  // Renderiza os slots do grid (Esquerda, Centro, Direita)
  for (let slotIdx = 0; slotIdx < analystSlotsCount; slotIdx++) {
    const slotZone = document.createElement('div');
    slotZone.className = 'chat-slot-zone';
    slotZone.setAttribute('data-slot-index', slotIdx);
    slotZone.addEventListener('dragover', handleChatDragOver);
    slotZone.addEventListener('dragleave', handleChatDragLeave);
    slotZone.addEventListener('drop', e => handleChatDrop(e, slotIdx));

    const activeInSlot = chatLayout.slots[slotIdx];

    if (activeInSlot.length > 1) {
      // Mais de 1 analista agrupado neste slot: renderiza wrapper vertical
      const wrapper = document.createElement('div');
      wrapper.className = 'chat-column-vertical-wrapper';

      activeInSlot.forEach(name => {
        const agent = busyAgents.find(a => a.name === name);
        if (agent) {
          // No agrupamento, padrão é modo compacto, exceto se o usuário configurou para full
          const isCompact = chatAnalystViewModes[agent.name] !== 'full';
          const col = createAnalystColumnElement(agent, isCompact, true, slotIdx, true);
          wrapper.appendChild(col);
        }
      });
      slotZone.appendChild(wrapper);
    } else if (activeInSlot.length === 1) {
      // 1 analista fixado neste slot
      const agent = busyAgents.find(a => a.name === activeInSlot[0]);
      if (agent) {
        const isCompact = chatAnalystViewModes[agent.name] === 'compact';
        const col = createAnalystColumnElement(agent, isCompact, true, slotIdx, false);
        slotZone.appendChild(col);
      }
    } else {
      // Slot livre: exibe o analista do carrossel rotativo
      const agent = rotatingAgentsDistribution[slotIdx];
      if (agent) {
        const isCompact = chatAnalystViewModes[agent.name] === 'compact';
        const col = createAnalystColumnElement(agent, isCompact, false, slotIdx, false);
        col.classList.add('accent-animated');
        slotZone.appendChild(col);
      }
    }

    container.appendChild(slotZone);
  }
}

// --- RENDERIZAÇÃO E ATUALIZAÇÃO DA UI ---

// Helper para categorizar erros de APIs externas com Selo da Plataforma
function categorizeError(errText, tagLabel, service = 'NPX') {
  const text = (errText || '').toLowerCase();
  const tagHtml = `<span class="alert-tag-badge">${tagLabel}</span>`;
  const serviceName = { NPX: 'NPX', PBX: 'PBX', PRIX: 'PrixChat' }[service] || 'serviço';

  if (text.includes('modo simulador')) {
    return {
      type: 'simulated',
      className: 'alert-banner-auth',
      iconHtml: '<i class="fa-solid fa-flask"></i>',
      msg: `${tagHtml} MODO SIMULADO: Dados de demonstracao, sem conexao ao ${serviceName} real.`
    };
  }

  if (text.includes('coleta parcial npx')) {
    return {
      type: 'partial',
      className: 'alert-banner-network',
      iconHtml: '<i class="fa-solid fa-triangle-exclamation"></i>',
      msg: `${tagHtml} COLETA PARCIAL: Estados dos analistas disponíveis; algumas métricas de fila não puderam ser atualizadas.`
    };
  }

  if (text.includes('err_tls_cert_altname_invalid') ||
      text.includes('hostname/ip does not match certificate')) {
    return {
      type: 'tls',
      className: 'alert-banner-server',
      iconHtml: '<i class="fa-solid fa-shield-halved"></i>',
      msg: `${tagHtml} CERTIFICADO TLS INCOMPATÍVEL: O endereço da API do ${serviceName} não corresponde ao certificado apresentado. Verifique a URL e o certificado.`
    };
  }

  if (text.includes('cert_has_expired') || text.includes('self_signed_cert') ||
      text.includes('unable_to_verify_leaf_signature') || text.includes('unable_to_get_issuer_cert')) {
    return {
      type: 'tls',
      className: 'alert-banner-server',
      iconHtml: '<i class="fa-solid fa-shield-halved"></i>',
      msg: `${tagHtml} FALHA NO CERTIFICADO TLS: Não foi possível validar o certificado da API do ${serviceName}. Verifique o certificado e sua cadeia de confiança.`
    };
  }

  if (text.includes('status npx indisponivel') || text.includes('status pbx indisponivel') || text.includes('status prixchat indisponivel')) {
    return {
      type: 'unavailable',
      className: 'alert-banner-network',
      iconHtml: '<i class="fa-solid fa-triangle-exclamation"></i>',
      msg: `${tagHtml} STATUS INDISPONIVEL: Nao foi possivel confirmar a conexao com o servico.`
    };
  }
  
  if (text.includes('401') || text.includes('403') || text.includes('login') || text.includes('senha') || text.includes('credencial') || text.includes('unauthorized')) {
    return {
      type: 'auth',
      className: 'alert-banner-auth',
      iconHtml: '<i class="fa-solid fa-key"></i>',
      msg: service === 'PBX'
        ? `${tagHtml} FALHA DE AUTENTICAÇÃO: Verifique as credenciais de integração do PBX.`
        : `${tagHtml} FALHA DE AUTENTICAÇÃO: Verifique as credenciais de integração do ${serviceName}.`
    };
  }

  if (text.includes('404')) {
    return {
      type: 'server',
      className: 'alert-banner-server',
      iconHtml: '<i class="fa-solid fa-globe"></i>',
      msg: `${tagHtml} API RESPONDEU HTTP 404: Tentando novamente; se persistir, revise a integração.`
    };
  }
  
  if (text.includes('502') || text.includes('500') || text.includes('503') || text.includes('504') || text.includes('bad gateway') || text.includes('server error')) {
    return {
      type: 'server',
      className: 'alert-banner-server',
      iconHtml: '<i class="fa-solid fa-globe"></i>',
      msg: `${tagHtml} 🌐 SERVIDOR INDISPONÍVEL: A API retornou instabilidade. Reconectando...`
    };
  }

  return {
    type: 'network',
    className: 'alert-banner-network',
    iconHtml: '<i class="fa-solid fa-satellite-dish"></i>',
    msg: `${tagHtml} 📡 CONEXÃO OSCILOU: Tentando restabelecer a comunicação com a API do ${serviceName} automaticamente...`
  };
}

// Helper para converter string de tempo "HH:MM:SS" ou "MM:SS" em segundos
function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(':').map(Number);
  if (parts.length === 3) {
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  }
  if (parts.length === 2) {
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  return 0;
}

// Helper para extrair o tempo limite de uma pausa a partir do seu nome (ex: Banheiro_10 -> 10min, Atend Externo_2h -> 2h, Almoço -> 2h, sem tempo -> Indefinida)
function getPauseLimitSeconds(pauseName) {
  if (!pauseName) return Infinity; // Indefinida
  
  const name = pauseName.toLowerCase().trim();
  
  // 1. Caso especial: Almoço = 2 horas (7200 segundos)
  if (name.includes('almoço') || name.includes('almoco')) {
    return 7200; // 2 horas padrão
  }
  
  // 2. Procura padrão de Horas com Minutos opcionais (ex: Atend Externo_2h, Treinamento_1h30, 2h, 3 horas)
  const hourCompoundMatch = name.match(/[_-\s]?(\d+)\s*h(?:oras?)?(?:[_-\s]?(\d+))?/);
  if (hourCompoundMatch) {
    const hours = parseInt(hourCompoundMatch[1], 10);
    const mins = hourCompoundMatch[2] ? parseInt(hourCompoundMatch[2], 10) : 0;
    return (hours * 3600) + (mins * 60);
  }
  
  // 3. Procura padrão de Minutos (ex: Banheiro_10, Lanche_10', WhatsApp_45', Pausa_30m, 15min)
  const minMatch = name.match(/[_-\s](\d+)\s*(?:'|m|min|minutos)?$/) || name.match(/[_-\s](\d+)/);
  if (minMatch) {
    return parseInt(minMatch[1], 10) * 60;
  }
  
  // 4. Sem tempo no nome -> Pausa Indefinida (não gera alerta de estouro de limite)
  return Infinity;
}

// Helper para definir a cor do botão com base na Psicologia das Cores
function getErrorStateClass(errText) {
  if (!errText) return 'warning';
  const text = errText.toLowerCase();
  if (text.includes('401') || text.includes('403') || text.includes('login') || text.includes('senha') || text.includes('credencial')) {
    return 'warning'; // Laranja Âmbar (#f59e0b) - Autenticação/Senha
  }
  if (text.includes('timeout') || text.includes('etimedout') || text.includes('enotfound') || text.includes('rede')) {
    return 'network-warning'; // Laranja Vivo (#ea580c) - Oscilação de Rede
  }
  return 'offline'; // Vermelho Queda Total (#ef4444) - HTTP 502/Servidor Fora
}

function updateUI(data) {
  if (typeof checkEventOverlay === 'function') checkEventOverlay(data);
  // 1. Atualiza Status de Conexão no topo e no rodapé (F11)
  const status = data.status || {};
  const npxMonitorAvailable = status.npx?.authenticated === true && !status.npx.error;
  const pbxMonitorAvailable = status.pbx?.authenticated === true && !status.pbx.error;
  const alertBanner = document.getElementById('npx-alert-banner');
  const alertMsg = document.getElementById('npx-alert-message');

  let npxErrorMsg = null;
  let npxWarningMsg = null;
  let pbxErrorMsg = null;
  let prixErrorMsg = null;

  // Status NPX (Infobrasil NPX)
  if (status.npx) {
    const errText = status.npx.error || '';
    if (status.npx.isSimulated) {
      npxErrorMsg = 'Modo simulador ativo';
      setConnectionStatus('npx', 'warning', 'NPX DEMO');
    } else if (status.npx.authenticated !== true || errText) {
      npxErrorMsg = errText || 'Desconectado';
      const errCodeMatch = errText.match(/\b\d{3}\b/);
      const errLabel = errCodeMatch ? `NPX ERRO ${errCodeMatch[0]}` : 'NPX OFF';
      const errClass = getErrorStateClass(errText);
      setConnectionStatus('npx', errClass, errLabel);
    } else if (status.npx.warning) {
      npxWarningMsg = status.npx.warning;
      setConnectionStatus('npx', 'warning', 'NPX PARCIAL');
    } else {
      setConnectionStatus('npx', 'connected', 'NPX');
    }
  } else {
    npxErrorMsg = 'Status NPX indisponivel';
    setConnectionStatus('npx', 'offline', 'NPX OFF');
  }

  // Status PBX (Nossa Tel PBX)
  if (status.pbx) {
    const errText = status.pbx.error || '';
    if (status.pbx.authenticated !== true || errText) {
      pbxErrorMsg = errText || 'Desconectado';
      let errLabel = 'PBX OFF';
      if (errText.includes('status code')) {
        const match = errText.match(/status code (\d{3})/);
        if (match) errLabel = `PBX ERRO ${match[1]}`;
      } else if (errText.includes('ECONN') || errText.includes('TIMEOUT')) {
        errLabel = 'PBX S/ REDE';
      }

      const errClass = getErrorStateClass(errText);
      setConnectionStatus('pbx', errClass, errLabel);
    } else {
      setConnectionStatus('pbx', 'connected', 'PBX');
    }
  } else {
    pbxErrorMsg = 'Status PBX indisponivel';
    setConnectionStatus('pbx', 'offline', 'PBX Off');
  }

  // Status PRIX (PrixChat)
  if (status.prix) {
    const errText = status.prix.error || '';
    if (status.prix.isSimulated) {
      prixErrorMsg = 'Modo simulador ativo';
      setConnectionStatus('prix', 'warning', 'PRIX DEMO');
    } else if (status.prix.authenticated !== true || errText) {
      prixErrorMsg = errText || 'Desconectado';
      let errLabel = 'PRIX OFF';
      if (errText.includes('status code')) {
        const match = errText.match(/status code (\d{3})/);
        if (match) errLabel = `PRIX ERRO ${match[1]}`;
      } else if (errText.includes('ECONN') || errText.includes('TIMEOUT')) {
        errLabel = 'PRIX S/ REDE';
      }

      const errClass = getErrorStateClass(errText);
      setConnectionStatus('prix', errClass, errLabel);
    } else {
      setConnectionStatus('prix', 'connected', 'PRIX');
    }
  } else {
    prixErrorMsg = 'Status PrixChat indisponivel';
    setConnectionStatus('prix', 'offline', 'PRIX OFF');
  }

  // Gerencia a exibição do Banner Inteligente de Alerta com Selo da Plataforma
  const activeErrInfo = npxErrorMsg ? categorizeError(npxErrorMsg, '<i class="fa-solid fa-phone"></i> INFOBRASIL NPX', 'NPX') :
                        pbxErrorMsg ? categorizeError(pbxErrorMsg, '<i class="fa-solid fa-phone-volume"></i> NOSSATEL PBX', 'PBX') :
                        prixErrorMsg ? categorizeError(prixErrorMsg, '<i class="fa-brands fa-whatsapp"></i> PRIXCHAT', 'PRIX') :
                        npxWarningMsg ? categorizeError(npxWarningMsg, '<i class="fa-solid fa-phone"></i> INFOBRASIL NPX', 'NPX') : null;

  if (alertBanner) {
    if (activeErrInfo) {
      alertBanner.style.backgroundColor = '';
      alertBanner.className = `npx-alert-banner ${activeErrInfo.className}`;
      if (alertMsg) {
        alertMsg.innerHTML = `${activeErrInfo.iconHtml} &nbsp; ${activeErrInfo.msg}`;
      }
    } else {
      alertBanner.style.backgroundColor = '';
      alertBanner.className = 'npx-alert-banner hidden';
    }
  }

  // 2. Renderiza o Widget SEFAZ Fiscal
  if (data.sefaz) {
    renderSefazWidget(data.sefaz);
  }

  let currentTotalQueue = 0;
  let allQueueCountsKnown = true;

  // Mapeamento dos elementos HTML de cada coluna/subsetor
  const deptMapping = {
    'InfoBrasil_Comercial': { prefix: 'comercial' },
    'Infobrasil_finan': { prefix: 'finan' },
    'InfoBrasil_SPED_Fiscal': { prefix: 'sped' },
    'InfoBrasil_Suporte': { prefix: 'suporte' },
    'InfoBrasil_Ponto': { prefix: 'ponto' }
  };

  // 3. Atualiza os dados de cada setor
  Object.entries(deptMapping).forEach(([key, domInfo]) => {
    const deptData = data.departments[key];
    if (!deptData) return;

    if (deptData.queue == null) allQueueCountsKnown = false;
    else currentTotalQueue += Number(deptData.queue) || 0;
    const prefix = domInfo.prefix;

    // Fila e Tempo de Espera
    const queueEl = document.getElementById(`${prefix}-queue`);
    const waitEl = document.getElementById(`${prefix}-wait`);
    const queueBar = document.getElementById(`${prefix}-queue-bar`);

    // Atualiza valores
    if (queueEl) queueEl.textContent = deptData.queue == null ? '—' : deptData.queue;
    if (waitEl) waitEl.textContent = deptData.wait_time_sec == null ? '—' : formatTime(deptData.wait_time_sec);

    // Alerta de SLA na barra de fila (se o elemento existir, como no Suporte)
    if (queueBar) {
      queueBar.className = 'queue-kpi-bar';
      if (deptData.queue >= CONFIG.limits.queue.critical) {
        queueBar.classList.add('queue-alert-critical');
      } else if (deptData.queue >= CONFIG.limits.queue.warning) {
        queueBar.classList.add('queue-alert-warning');
      }
    }

    // Badge com contagem de agentes online do setor
    const onlineBadge = document.getElementById(`${prefix}-online-badge`);
    if (onlineBadge) {
      if (onlineBadge.classList.contains('sub-online')) {
        onlineBadge.textContent = `${deptData.agents_online || 0} ON`;
      } else {
        onlineBadge.textContent = `${deptData.agents_online || 0} Online`;
      }
    }

    // --- SEÇÃO DE CHAMADAS EM FILA ---
    const waitingSection = document.getElementById(`${prefix}-waiting-section`);
    const waitingList = document.getElementById(`${prefix}-waiting-list`);
    
    if (waitingList) {
      waitingList.innerHTML = '';
      const queuedCalls = deptData.calls.filter(c => c.status === 'Fila');

      if (queuedCalls.length > 0 && waitingSection) {
        waitingSection.style.display = 'block';
        queuedCalls.forEach(call => {
          const item = document.createElement('div');
          item.className = 'wait-client-item';
          item.innerHTML = `
            <span><i class="fa-solid fa-phone-volume"></i> ${escapePanelHtml(call.client)}</span>
            <span class="wait-duration-badge">${formatTime(call.time_sec)}</span>
          `;
          waitingList.appendChild(item);
        });
      } else if (waitingSection) {
        waitingSection.style.display = 'none';
      }
    }

    // A ordenação e as cores dos cards devem usar as mesmas regras de estado.
    // PBX registrado tem precedência sobre qualquer presença na fila NPX.
    const { getAgentConnectionState, getAgentPriority, getAgentDisplayedCall } = window.InfoBoardAgentState;

    // --- SEÇÃO DE ANALISTAS ---
    const analystsList = document.getElementById(`${prefix}-analysts-list`);
    if (analystsList) {
      analystsList.innerHTML = '';
      // Mesma fila canônica para ordenação, status operacional e card em todos
      // os cinco setores. A observação de NPX de outra fila permanece inválida.
      const agents = (deptData.agents || []).map(agent => ({ ...agent, npxQueue: key }));

      if (agents.length === 0) {
        analystsList.innerHTML = `<div class="no-analysts">Sem analistas logados</div>`;
      } else {
        // Hierarquia Rígida de Blocos:
        // 1. Ocupado PBX (Vermelho Claro)
        // 2. Ocupado NPX (Vermelho Sólido)
        // 3. Pausado (Azul)
        // 4. Livre PBX (Verde Claro / Borda)
        // 5. Livre NPX (Verde Sólido)
        // 6. Offline (Cinza)
        agents.sort((a, b) => {
          const stateA = resolveAgentRealPauseState(a, getAgentConnectionState(a));
          const priorityA = (stateA.isPaused && !stateA.connection.isCallActive) ? 3 : getAgentPriority(a);
          const stateB = resolveAgentRealPauseState(b, getAgentConnectionState(b));
          const priorityB = (stateB.isPaused && !stateB.connection.isCallActive) ? 3 : getAgentPriority(b);
          
          if (priorityA !== priorityB) {
            return priorityA - priorityB;
          }
          
          // Desempate alfabético por nome
          const nameA = a.name || '';
          const nameB = b.name || '';
          return nameA.localeCompare(nameB, 'pt-BR');
        });

        agents.forEach(agent => {
          const card = document.createElement('div');
          card.className = 'analyst-card';
          let statusClass = 'status-offline';
          let badgeHtml = '';
          let statusLabel = 'Offline';
          const connection = getAgentConnectionState(agent);
          const pauseState = resolveAgentRealPauseState(agent, connection);
          const { pauseName, isRealNpxCall, isCallActive, isPaused } = pauseState;

          let isOverLimit = false;
          if (isPaused) {
            const pauseLimit = getPauseLimitSeconds(pauseName);
            const pauseSeconds = agent.duration || parseTimeToSeconds(agent.time);
            isOverLimit = (pauseSeconds >= pauseLimit);
          }

          // O ramal do analista ocupa sempre a última posição, inclusive em pausa e ligação.
          // pbxNumber é o telefone da chamada PBX, não o ramal do analista.
          const agentExtension = connection.isPbxRegistered
            ? (agent.ramal || agent.extension || agent.code || '')
            : (agent.code || agent.extension || agent.ramal || '');
          const ramalDisplay = agentExtension ? String(agentExtension).slice(-4) : '';
          if (card.dataset) {
            card.dataset.agentRamal = ramalDisplay;
            card.dataset.agentQueue = key;
          }

          // Numero, direcao e duracao devem ser do mesmo ramal exibido no card.
          const { source: activeCallSource, number: realNumber, outbound: isOutbound } = getAgentDisplayedCall(agent);
          const dirIcon = isOutbound 
            ? `<span class="dir-badge outbound" title="Chamada Realizada (Saída)"><i class="fa-solid fa-arrow-up-long"></i></span>`
            : `<span class="dir-badge inbound" title="Chamada Recebida (Entrada)"><i class="fa-solid fa-arrow-down-long"></i></span>`;

          // Tempo e Duração Real da Chamada (separado do tempo de pausa)
          let formattedCallTime = '00:00';
          let callSeconds = 0;
          if (activeCallSource === 'npx') {
            callSeconds = agent.duration || parseTimeToSeconds(agent.time);
            formattedCallTime = agent.time || '00:00';
          } else if (activeCallSource === 'pbx') {
            callSeconds = agent.pbxDuration || (agent.pbxDurationStr ? parseTimeToSeconds(agent.pbxDurationStr) : 0);
            if (agent.pbxDurationStr) {
              formattedCallTime = agent.pbxDurationStr;
            } else if (agent.pbxDuration) {
              const m = Math.floor(agent.pbxDuration / 60);
              const s = agent.pbxDuration % 60;
              formattedCallTime = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            }
          }

          // Alerta de ligação longa: A partir de 1 hora de atendimento (3600 segundos)
          const isLongCall = isCallActive && (callSeconds >= 3600);

          if (isLongCall) {
            isOverLimit = true;
          }

          if (isPaused && isCallActive) {
            // REGRA: Card AZUL de Pausa (status-5) + Badge Interno VERMELHO de Ligação (status-2)
            statusClass = 'status-5';

            badgeHtml = `
              <span class="status-text-badge status-2 ${isLongCall ? 'alert' : ''}" title="Ligação ativa durante a Pausa (${escapePanelHtml(pauseName)}) ${isLongCall ? ' - EXCEDEU 1 HORA!' : ''}">
                <span class="badge-detail-label">${dirIcon}<span class="badge-detail-text">${escapePanelHtml(realNumber)}</span></span><span class="badge-divider">|</span><span class="badge-time">${escapePanelHtml(formattedCallTime)}</span>
              </span>
            `;
          } else if (isCallActive) {
            statusClass = isRealNpxCall ? 'status-2' : 'status-pbx-busy';

            badgeHtml = `
              <span class="status-text-badge status-2 ${isLongCall ? 'alert' : ''}" title="${isLongCall ? 'ATENDIMENTO EXCEDEU 1 HORA!' : 'Em Ligação'}">
                <span class="badge-detail-label">${dirIcon}<span class="badge-detail-text">${escapePanelHtml(realNumber)}</span></span><span class="badge-divider">|</span><span class="badge-time">${escapePanelHtml(formattedCallTime)}</span>
              </span>
            `;
          } else if (isPaused) {
            statusClass = 'status-5';
            statusLabel = pauseName;
            badgeHtml = buildPausePillHtml(statusLabel, agent.time || '00:00', isOverLimit);
          } else if (connection.isPbxRegistered) {
            statusClass = 'status-pbx-free';
            badgeHtml = '';
          } else if (!npxMonitorAvailable) {
            statusClass = 'status-npx-unverified';
            // Falha global da coleta aparece no cabeçalho, sem rótulo repetido por analista.
            badgeHtml = '';
          } else if (connection.isNpxBusy) {
            statusClass = 'status-2';
            badgeHtml = '<span class="status-text-badge status-2" title="O monitor oficial NPX informa ocupado; sem numero de chamada confirmado">Ocupado na NPX</span>';
          } else if (connection.isNpxRinging) {
            statusClass = 'status-npx-unverified';
            badgeHtml = '<span class="status-text-badge status-npx-unverified" title="O monitor oficial NPX informa chamada tocando neste ramal">Chamando</span>';
          } else if (connection.isNpxQueueOnline) {
            statusClass = 'status-1';
            // Estado operacional atual do monitor oficial; SIP continua independente.
            badgeHtml = '';
          } else if (connection.isNpxQueueDisconnected) {
            if (connection.isDisconnectedBoth && pbxMonitorAvailable) {
              card.classList.add('offline-card');
              badgeHtml = '<span class="status-text-badge status-offline" title="NPX: desligado na fila. PBX: dispositivo sem registro, confirmado por consulta atual. O MicroSIP pode estar aberto.">Sem conexão NPX/PBX</span>';
            } else {
              // Falta de observação do PBX é diagnóstico interno, não um aviso
              // operacional a ser repetido em cada cartão de analista.
              statusClass = 'status-npx-unverified';
              badgeHtml = '';
            }
          } else if (connection.isNpxOperationalUnknown) {
            statusClass = 'status-npx-unverified';
            badgeHtml = '<span class="status-text-badge status-npx-unverified" title="Sem observacao operacional valida e recente do monitor oficial">Status NPX não confirmado</span>';
          } else if (connection.isNpxSipUnknown) {
            statusClass = 'status-npx-unverified';
            badgeHtml = '<span class="status-text-badge status-npx-unverified" title="Presente na fila NPX, mas sem confirmacao de registro SIP">SIP não confirmado</span>';
          } else if (connection.isNpxSipDisconnected) {
            statusClass = 'status-npx-disconnected';
            badgeHtml = '<span class="status-text-badge status-npx-disconnected" title="Presente na fila NPX, mas com ramal SIP informado como desconectado">Ramal desconectado</span>';
          } else {
            card.classList.add('offline-card');
            badgeHtml = '<span class="status-text-badge status-offline" title="Sem presença confirmada no monitor da fila NPX ou registro PBX">Offline</span>';
          }

          // Aplica a mesma cor de estado em todos os departamentos.
          card.classList.add(statusClass);
          if (isOverLimit) card.classList.add('alert-blink');

          const ramalRightHtml = ramalDisplay ? `<span class="analyst-ramal-center" title="Ramal ${escapePanelHtml(ramalDisplay)}">${escapePanelHtml(ramalDisplay)}</span>` : '<span class="analyst-ramal-center"></span>';

          card.innerHTML = `
            <div class="analyst-row-main">
              <div class="analyst-name-info">
                <span class="penalty-tag">${escapePanelHtml(agent.penalty || 1)}</span>
                <span class="analyst-name" title="${escapePanelHtml(agent.name)}">${escapePanelHtml(agent.name)}</span>
                <i class="fa-solid fa-circle-info details-btn" title="Ver Métricas"></i>
              </div>
              ${badgeHtml}
              ${ramalRightHtml}
            </div>
            <div class="analyst-metrics-drawer">
              <div class="metrics-grid">
                <div class="metric-item">
                  <span class="metric-lbl"><i class="fa-solid fa-right-to-bracket"></i> Logado</span>
                  <span class="metric-val">${escapePanelHtml(agent.total_loged_time || '00:00:00')}</span>
                </div>
                <div class="metric-item">
                  <span class="metric-lbl"><i class="fa-solid fa-circle-pause"></i> Pausado</span>
                  <span class="metric-val">${escapePanelHtml(agent.total_paused_time || '00:00:00')}</span>
                </div>
                <div class="metric-item">
                  <span class="metric-lbl"><i class="fa-solid fa-phone"></i> Atend.</span>
                  <span class="metric-val">${escapePanelHtml(agent.total_call_time || '00:00:00')}</span>
                </div>
                <div class="metric-item">
                  <span class="metric-lbl"><i class="fa-solid fa-mug-hot"></i> Ocioso</span>
                  <span class="metric-val">${escapePanelHtml(agent.total_lazy_time || '00:00:00')}</span>
                </div>
              </div>
            </div>
          `;

          // Mantém expandido se o analista foi clicado previamente
          const agentKey = `${prefix}_${agent.name}`;
          if (expandedAnalysts.has(agentKey)) {
            card.classList.add('active');
          }

          // Só o ícone de métricas é interativo; o card é informativo.
          card.querySelector('.details-btn').addEventListener('click', () => {
            if (expandedAnalysts.has(agentKey)) {
              expandedAnalysts.delete(agentKey);
              card.classList.remove('active');
            } else {
              expandedAnalysts.add(agentKey);
              card.classList.add('active');
            }
          });

          analystsList.appendChild(card);
        });
      }
    }
  });

  // 4. Calcula contagens agregadas do painel de Voz
  const totalComercial = data.departments['InfoBrasil_Comercial']?.agents_online || 0;
  const totalFinan = data.departments['Infobrasil_finan']?.agents_online || 0;
  const totalSped = data.departments['InfoBrasil_SPED_Fiscal']?.agents_online || 0;
  const totalSuporte = data.departments['InfoBrasil_Suporte']?.agents_online || 0;
  const totalPonto = data.departments['InfoBrasil_Ponto']?.agents_online || 0;

  const totalOutros = totalComercial + totalFinan + totalSped + totalPonto;
  const totalVoz = totalOutros + totalSuporte;

  const outrosOnlineBadge = document.getElementById('outros-online-badge');
  if (outrosOnlineBadge) {
    outrosOnlineBadge.textContent = `${totalOutros} Online`;
  }

  const voiceSummaryCount = document.getElementById('voice-summary-count');
  if (voiceSummaryCount) {
    voiceSummaryCount.textContent = `${totalVoz} Online`;
  }

  // 5. Renderiza a metade do Chat (PrixChat)
  renderPrixChat(data.prixchat);

  // 6. Atualiza o Ticker da Escala de Sábado, Sobreaviso e Férias com Pills Coloridas
  const tickerTextEl = document.getElementById('ticker-text');
  if (!data.horarios && tickerTextEl) {
    tickerTextEl.textContent = 'Escala e sobreaviso indisponíveis — aguardando conexão com o servidor de horários.';
  }
  if (data.horarios) {
    if (tickerTextEl) {
      const htmlContent = data.horarios.tickerHtml;
      if (htmlContent) {
        if (tickerTextEl.innerHTML !== htmlContent) {
          tickerTextEl.innerHTML = htmlContent;
        }
      } else {
        const plainText = data.horarios.tickerText || '';
        if (tickerTextEl.textContent !== plainText) {
          tickerTextEl.textContent = plainText;
        }
      }
    }

    // --- BIRTHDAY MODE: decora o painel inteiro ---
    const hasToday = data.horarios.aniversariantesHojeData && data.horarios.aniversariantesHojeData.length > 0;
    if (hasToday) {
      if (!document.body.classList.contains('birthday-mode')) {
        document.body.classList.add('birthday-mode');
        startPartyDecorations(data.horarios.aniversariantesHojeData);
      }
    } else {
      if (document.body.classList.contains('birthday-mode')) {
        document.body.classList.remove('birthday-mode');
        stopPartyDecorations();
      }
    }
  }

  // 7. Efeito Sonoro quando a fila total aumenta
  if (allQueueCountsKnown && previousTotalQueue != null && currentTotalQueue > previousTotalQueue) {
    playQueueBeep();
  }
  previousTotalQueue = allQueueCountsKnown ? currentTotalQueue : null;
}

// --- CONTROLE DE TELA CHEIA (F11) ---
function checkFullscreen() {
  const isFullscreen = 
    window.innerHeight === window.screen.height || 
    window.matchMedia('(display-mode: fullscreen)').matches ||
    document.fullscreenElement !== null;

  if (isFullscreen) {
    document.body.classList.add('fullscreen-mode');
  } else {
    document.body.classList.remove('fullscreen-mode');
  }
}

// --- SEMÁFORO DE DISPONIBILIDADE SEFAZ ---
function renderSefazWidget(sefazData) {
  if (!sefazData) return;
  const radarList = document.getElementById('sefaz-radar-list');
  if (!radarList) return;

  const lastUpdateMs = Date.parse(sefazData.lastUpdate);
  const isStale = !Number.isFinite(lastUpdateMs) || Math.abs(Date.now() - lastUpdateMs) > 180000;

  const docs = [
    { key: 'nfe', name: 'NF-e', uf: 'CE' },
    { key: 'nfce', name: 'NFC-e', uf: 'CE' },
    { key: 'cte', name: 'CT-e', uf: 'CE' },
    { key: 'mdfe', name: 'MDF-e', uf: 'CE' }
  ];

  let rowsHtml = '';
  const statuses = [];
  const escapeAttribute = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  docs.forEach(doc => {
    const rawStatus = sefazData[doc.key]?.status;
    const hasData = ['OK', 'WARNING', 'DANGER', 'OFF', 'CONTINGENCY'].includes(rawStatus);
    const candidate = isStale ? 'STALE' : (hasData ? rawStatus : 'UNKNOWN');
    statuses.push(candidate);

    let rowStatusClass = 'status-unknown';
    let statusText = 'SEM DADOS';

    if (isStale) {
      rowStatusClass = 'status-unknown status-stale';
      statusText = 'DESATUALIZADO';
    } else if (candidate === 'OK') {
      rowStatusClass = 'status-ok';
      statusText = 'NORMAL';
    } else if (candidate === 'WARNING' || candidate === 'CONTINGENCY') {
      rowStatusClass = 'status-warning';
      statusText = 'INSTÁVEL';
    } else if (candidate === 'DANGER' || candidate === 'OFF') {
      rowStatusClass = 'status-danger';
      statusText = 'INDISPONÍVEL';
    } else {
      rowStatusClass = 'status-unknown';
      statusText = 'SEM DADOS';
    }

    const description = isStale ? 'Consulta do painel desatualizada' :
      (sefazData[doc.key]?.detail || 'Aguardando consulta ao monitor IntegraNotas');
    const titleText = `${doc.name} (${doc.uf}): ${description}`;

    rowsHtml += `
      <div class="sefaz-radar-row ${rowStatusClass}" data-sefaz-document="${doc.key}" title="${escapeAttribute(titleText)}" aria-label="${escapeAttribute(`${doc.name} ${doc.uf}: ${statusText}`)}">
        <div class="radar-row-info">
          <span class="doc-badge">${doc.name}</span>
          <span class="uf-tag">(${doc.uf})</span>
        </div>
        <div class="radar-row-status">
          <span class="sefaz-status-dot" aria-hidden="true"></span>
          <span class="latency-text">${statusText}</span>
        </div>
      </div>
    `;
  });

  radarList.innerHTML = rowsHtml;

  const globalBadge = document.getElementById('sefaz-global-badge');
  if (globalBadge) {
    const hasDanger = statuses.some(status => status === 'DANGER' || status === 'OFF');
    const hasWarning = statuses.includes('WARNING') || statuses.includes('CONTINGENCY');
    const hasUnknown = statuses.includes('UNKNOWN') || statuses.includes('STALE');
    globalBadge.hidden = !(hasDanger || hasWarning || hasUnknown);

    if (hasDanger) {
      globalBadge.className = 'sefaz-global-badge status-danger';
      globalBadge.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> SERVIÇO OFFLINE';
    } else if (hasWarning) {
      globalBadge.className = 'sefaz-global-badge status-warning';
      globalBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> OSCILANDO';
    } else if (hasUnknown) {
      globalBadge.className = 'sefaz-global-badge status-unknown';
      globalBadge.innerHTML = '<i class="fa-solid fa-circle-question"></i> SEM CONFIRMAÇÃO';
    } else {
      globalBadge.className = 'sefaz-global-badge status-ok';
      globalBadge.innerHTML = '';
    }
  }
}

window.addEventListener('resize', checkFullscreen);
document.addEventListener('fullscreenchange', checkFullscreen);
// Execução inicial
checkFullscreen();

// --- SISTEMA DE DECORAÇÃO DE FESTA (BIRTHDAY MODE) ---
let _partyInterval = null;
let _partyContainer = null;

function startPartyDecorations(birthdayPeople) {
  if (_partyContainer) return; // já ativo

  // Container principal de decorações
  _partyContainer = document.createElement('div');
  _partyContainer.id = 'party-decorations';
  _partyContainer.style.cssText = 'position:fixed;inset:0;z-index:5;pointer-events:none;overflow:hidden;';
  document.body.appendChild(_partyContainer);

  // Cria balões flutuantes
  const balloons = ['🎈','🎈','🎈','🎈','🎈','🎈','🎈','🎈'];
  const colors = ['#ff4d4d','#ff9900','#ffee00','#44cc44','#4499ff','#cc44ff','#ff44aa','#00cccc'];
  balloons.forEach((b, i) => {
    const el = document.createElement('div');
    const left = 3 + (i / balloons.length) * 94;
    const dur = 12 + Math.random() * 10;
    const delay = -(Math.random() * dur);
    const size = 28 + Math.random() * 16;
    el.style.cssText = `
      position:absolute;
      bottom:-80px;
      left:${left}%;
      font-size:${size}px;
      filter: hue-rotate(${i * 45}deg);
      animation: balloon-float ${dur}s ease-in-out ${delay}s infinite;
      user-select:none;
      line-height:1;
    `;
    el.textContent = b;
    _partyContainer.appendChild(el);
  });

  // Cria fitas/streamers caindo do topo
  const streamerColors = ['#ff4d4d','#ffee00','#44cc44','#4499ff','#ff44aa','#ff9900','#cc44ff','#ffffff'];
  for (let i = 0; i < 20; i++) {
    const el = document.createElement('div');
    const left = Math.random() * 100;
    const dur = 4 + Math.random() * 5;
    const delay = -(Math.random() * dur);
    const width = 4 + Math.random() * 5;
    const height = 18 + Math.random() * 20;
    const color = streamerColors[i % streamerColors.length];
    el.style.cssText = `
      position:absolute;
      top:-30px;
      left:${left}%;
      width:${width}px;
      height:${height}px;
      background:${color};
      border-radius:2px;
      opacity:0.7;
      animation: streamer-fall ${dur}s linear ${delay}s infinite;
    `;
    _partyContainer.appendChild(el);
  }

  // Banner de aniversário no topo do painel
  const names = birthdayPeople.map(p => p.nome).join(' & ');
  const banner = document.createElement('div');
  banner.id = 'birthday-banner';
  banner.style.cssText = `
    position:absolute;
    top:0;left:0;right:0;
    height:4px;
    background: linear-gradient(90deg, #ff0000,#ff8800,#ffff00,#00cc44,#0088ff,#aa00ff,#ff00aa,#ff0000);
    background-size: 200% auto;
    animation: banner-slide 3s linear infinite;
    z-index:10;
  `;
  _partyContainer.appendChild(banner);

  // Segundo banner embaixo (espelhado)
  const banner2 = banner.cloneNode();
  banner2.style.top = 'auto';
  banner2.style.bottom = '0';
  _partyContainer.appendChild(banner2);

  // Chapeuzinhos de festa flutuando pela tela (subindo e descendo)
  const hatEmojis = ['🎉', '🎊', '🎉', '🎊', '🎉', '🎊'];
  const hatDirections = ['up', 'down', 'up', 'down', 'up', 'down']; // alternados
  hatEmojis.forEach((emoji, i) => {
    const hat = document.createElement('div');
    const left = 8 + (i / hatEmojis.length) * 84; // espalhados horizontalmente
    const size = 30 + Math.random() * 20;
    const dur = 10 + Math.random() * 8;
    const delay = -(Math.random() * dur);
    const rot = (Math.random() - 0.5) * 40;
    const goUp = hatDirections[i] === 'up';
    const anim = goUp ? 'hat-float-up' : 'hat-float-down';

    hat.style.cssText = `
      position: absolute;
      left: ${left}%;
      ${goUp ? 'bottom: -60px' : 'top: -60px'};
      font-size: ${size}px;
      transform: rotate(${rot}deg);
      line-height: 1;
      user-select: none;
      animation: ${anim} ${dur}s ease-in-out ${delay}s infinite;
      filter: drop-shadow(0 2px 8px rgba(0,0,0,0.35));
      z-index: 6;
    `;
    hat.textContent = emoji;
    _partyContainer.appendChild(hat);
  });
}

function stopPartyDecorations() {
  if (_partyContainer) {
    _partyContainer.style.transition = 'opacity 1s ease';
    _partyContainer.style.opacity = '0';
    setTimeout(() => {
      if (_partyContainer) { _partyContainer.remove(); _partyContainer = null; }
    }, 1000);
  }
  clearInterval(_partyInterval);
  _partyInterval = null;
}

// Confete em POPPERS LATERAIS — estoura das bordas esquerda e direita da foto
function launchSideConfetti(photoLeft, photoTop, photoSize) {
  const colors = ['#ff0000','#ff8800','#ffff00','#00cc44','#0088ff','#aa00ff','#ff00aa','#ffffff','#ffdd00','#ff69b4'];
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;inset:0;z-index:10001;pointer-events:none;overflow:hidden;';
  document.body.appendChild(container);

  const leftX  = photoLeft;                     // borda esquerda
  const rightX = photoLeft + photoSize;          // borda direita
  const midY   = photoTop  + photoSize * 0.45;  // altura do centro da foto

  for (let i = 0; i < 100; i++) {
    const fromRight = i >= 50;                  // metade de cada lado
    const startX = fromRight ? rightX : leftX;
    const startY = midY + (Math.random() - 0.5) * photoSize * 0.35;

    // Ângulo: estoura para fora em leque de ±75° na horizontal
    const spreadDeg = (Math.random() * 150) - 75;        // -75° a +75°
    const rad = (spreadDeg * Math.PI) / 180;
    const dist = 180 + Math.random() * 400;

    // Direção base: para fora da foto + queda com gravidade
    const dx = fromRight
      ?  Math.cos(rad) * dist                            // direita: vai para direita
      : -Math.cos(rad) * dist;                           // esquerda: vai para esquerda
    const dy = Math.abs(Math.sin(rad)) * dist * 0.6      // spread vertical
             + 150 + Math.random() * 200;                // gravidade para baixo

    const piece    = document.createElement('div');
    const color    = colors[Math.floor(Math.random() * colors.length)];
    const sz       = 6 + Math.random() * 8;
    const isCircle = Math.random() > 0.5;
    const dur      = 1.5 + Math.random() * 1.8;
    const delay    = Math.random() * 0.4;
    const spin     = (Math.random() - 0.5) * 900;

    piece.style.cssText = `
      position:absolute;
      left:${startX - sz/2}px;
      top:${startY  - sz/2}px;
      width:${sz}px;
      height:${isCircle ? sz : sz * 0.35}px;
      background:${color};
      border-radius:${isCircle ? '50%' : '2px'};
      opacity:1;
    `;

    const animName = `sc${i}_${Date.now()}`;
    const styleEl  = document.createElement('style');
    styleEl.textContent = `@keyframes ${animName}{0%{transform:translate(0,0) rotate(0deg);opacity:1;}75%{opacity:1;}100%{transform:translate(${dx}px,${dy}px) rotate(${spin}deg);opacity:0;}}`;
    document.head.appendChild(styleEl);
    piece.style.animation = `${animName} ${dur}s ease-out ${delay}s forwards`;
    container.appendChild(piece);
    setTimeout(() => styleEl.remove(), (dur + delay + 0.5) * 1000);
  }
  return container;
}

// --- ZOOM DO ANIVERSARIANTE QUANDO PASSAR NO LETREIRO ---
(function initBirthdayZoom() {
  let zooming = false;
  let birthdayIndex = 0; // reveza entre os aniversariantes do dia

  function checkBirthdayPillPosition() {
    if (zooming) return;
    const pill = document.querySelector('.pill-aniversariantes');
    if (!pill) return;

    // Usa a posição da 1ª foto para detectar o momento de disparar
    const firstImg = pill.querySelector('strong img');
    if (!firstImg) return;

    const rect = firstImg.getBoundingClientRect();
    const screenCenterX = window.innerWidth / 2;

    if (rect.width > 0 && rect.left < screenCenterX + 80 && rect.right > screenCenterX - 80) {
      // Pega todos os aniversariantes do dia e seleciona pelo índice atual
      const allImgs = pill.querySelectorAll('strong img');
      const imgToShow = allImgs[birthdayIndex % allImgs.length];
      // Avança o índice para o próximo ciclo (revezamento)
      birthdayIndex = (birthdayIndex + 1) % allImgs.length;
      triggerBirthdayZoom(imgToShow);
    }
  }

  function triggerBirthdayZoom(imgEl) {
    zooming = true;

    const strong = imgEl.closest('strong');
    const rawText = strong ? strong.textContent : '';
    const nome = rawText.replace(/🎉|🎂/g, '').replace(/Feliz Aniversário[,\s]*/i, '').trim();

    const srcRect = imgEl.getBoundingClientRect();

    // Overlay escuro
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0);pointer-events:none;transition:background 0.5s ease;';
    document.body.appendChild(overlay);

    // Avatar flutuante com chapeuzinho
    const size = Math.min(window.innerWidth, window.innerHeight) * 0.32;
    const cx = (window.innerWidth - size) / 2;
    const cy = (window.innerHeight - size) / 2 - 50;

    const flyEl = document.createElement('div');
    flyEl.style.cssText = `position:fixed;left:${srcRect.left}px;top:${srcRect.top}px;width:${srcRect.width}px;height:${srcRect.height}px;border-radius:50%;z-index:9999;pointer-events:none;overflow:visible;`;
    flyEl.innerHTML = `
      <div style="width:100%;height:100%;border-radius:50%;overflow:hidden;position:relative;z-index:1;background:#1e293b;display:flex;align-items:center;justify-content:center;">
        <img src="${escapePanelHtml(imgEl.src)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=\'font-size:3.5rem;\'>🎂</span>';">
      </div>
      <div class="birthday-hat" style="position:absolute;top:-55%;left:50%;transform:translateX(-60%) rotate(-20deg);font-size:0;z-index:2;transition:font-size 0.5s ease;line-height:1;">🎩</div>`;
    document.body.appendChild(flyEl);

    // Texto "Parabéns!"
    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'position:fixed;left:50%;top:calc(50% + 115px);transform:translateX(-50%);z-index:9999;color:#ffeb3b;font-size:2.2rem;font-weight:800;text-shadow:0 2px 15px rgba(255,235,59,0.6),0 0 30px rgba(255,235,59,0.3);opacity:0;transition:opacity 0.5s ease;pointer-events:none;white-space:nowrap;font-family:inherit;letter-spacing:1px;';
    nameEl.textContent = `🎉 Parabéns, ${nome}! 🎂`;
    document.body.appendChild(nameEl);

    // Fase 1: expande para o centro
    requestAnimationFrame(() => requestAnimationFrame(() => {
      overlay.style.background = 'rgba(0,0,0,0.65)';

      flyEl.style.transition = 'left 0.8s ease, top 0.8s ease, width 0.8s ease, height 0.8s ease';
      flyEl.style.left = `${cx}px`;
      flyEl.style.top = `${cy}px`;
      flyEl.style.width = `${size}px`;
      flyEl.style.height = `${size}px`;

      // Anel arco-íris
      flyEl.style.padding = '5px';
      flyEl.style.background = 'linear-gradient(45deg,#ff0000,#ff8000,#ffff00,#00ff00,#0000ff,#8000ff,#ff0080)';
      flyEl.style.backgroundSize = '400% 400%';
      flyEl.style.animation = 'rainbow-glow 2s linear infinite';
      flyEl.style.boxShadow = '0 0 50px rgba(255,255,255,0.5)';

      // Chapeuzinho e nome aparecem após expansão
      setTimeout(() => {
        const hat = flyEl.querySelector('.birthday-hat');
        if (hat) hat.style.fontSize = '70%';
        nameEl.style.opacity = '1';
      }, 800);
    }));

    // Fase 2: encolhe de volta para o rodapé após 10s
    setTimeout(() => {
      nameEl.style.opacity = '0';
      const hat = flyEl.querySelector('.birthday-hat');
      if (hat) hat.style.fontSize = '0';
      flyEl.style.transition = 'left 0.8s ease, top 0.8s ease, width 0.8s ease, height 0.8s ease, opacity 0.6s ease';
      flyEl.style.left = `${srcRect.left}px`;
      flyEl.style.top = `${srcRect.top}px`;
      flyEl.style.width = `${srcRect.width}px`;
      flyEl.style.height = `${srcRect.height}px`;
      flyEl.style.opacity = '0';
      overlay.style.background = 'rgba(0,0,0,0)';
    }, 10000);

    // Fase 3: limpa tudo
    setTimeout(() => {
      flyEl.remove();
      overlay.remove();
      nameEl.remove();
      // Aguarda ~15 minutos antes de permitir o próximo disparo
      // O trigger só acontece quando a foto passar no centro do ticker novamente
      setTimeout(() => { zooming = false; }, 15 * 60 * 1000 - 11000);
    }, 11000);
  }

  setInterval(checkBirthdayPillPosition, 300);
})();



// Categorias visuais de pausas observadas no NPX; nenhuma ação é enviada.
const pauseVisualCategories = [
  {
    title: "☕ Pausas Pessoais / Fisiológicas",
    color: "#ea580c",
    items: [
      { id: "Água_5'", label: "Água", time: "5 min", icon: "fa-solid fa-glass-water" },
      { id: "Banheiro_10'", label: "Banheiro", time: "10 min", icon: "fa-solid fa-restroom" },
      { id: "Lanche_10'", label: "Lanche", time: "10 min", icon: "fa-solid fa-burger" },
      { id: "Almoço", label: "Almoço", time: "2h", icon: "fa-solid fa-utensils" },
      { id: "AssuntoPessoal_45'", label: "Assunto Pessoal", time: "45 min", icon: "fa-solid fa-user-clock" }
    ]
  },
  {
    title: "💻 Operacional / Atendimento",
    color: "#2563eb",
    items: [
      { id: "Em Atend_45'", label: "Em Atendimento", time: "45 min", icon: "fa-solid fa-headset" },
      { id: "WhatsApp_45'", label: "WhatsApp", time: "45 min", icon: "fa-brands fa-whatsapp" },
      { id: "ProcTestes_45'", label: "Processos/Testes", time: "45 min", icon: "fa-solid fa-vial" },
      { id: "NossaTelecom", label: "Nossa Telecom", time: "Livre", icon: "fa-solid fa-phone" }
    ]
  },
  {
    title: "🏢 Eventos / Externos",
    color: "#7c3aed",
    items: [
      { id: "Meeting_2h", label: "Reunião / Meeting", time: "2h", icon: "fa-solid fa-users" },
      { id: "DemoRemota_3h", label: "Demo Remota", time: "3h", icon: "fa-solid fa-desktop" },
      { id: "Instal.Remota", label: "Instalação Remota", time: "Livre", icon: "fa-solid fa-download" },
      { id: "Trein.Interno", label: "Treinamento Interno", time: "Livre", icon: "fa-solid fa-chalkboard-user" },
      { id: "Trein.Remoto", label: "Treinamento Remoto", time: "Livre", icon: "fa-solid fa-laptop-file" },
      { id: "Serv.Externo", label: "Serviço Externo", time: "Livre", icon: "fa-solid fa-car" },
      { id: "Representantes", label: "Representantes", time: "Livre", icon: "fa-solid fa-handshake" }
    ]
  }
];

function getPauseCategoryVisual(pauseName) {
  const raw = String(pauseName || '').trim();
  const norm = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  let matchedColor = null;
  let matchedIcon = 'fa-solid fa-circle-pause';
  if (Array.isArray(pauseVisualCategories)) {
    for (const group of pauseVisualCategories) {
      for (const item of (group.items || [])) {
        const itemNormId = String(item.id || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
        const itemNormLbl = String(item.label || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
        if (
          raw === item.id ||
          raw === item.label ||
          (norm && (
            norm === itemNormId ||
            norm === itemNormLbl ||
            (norm.length >= 3 && (itemNormId.includes(norm) || norm.includes(itemNormId) || itemNormLbl.includes(norm) || norm.includes(itemNormLbl)))
          ))
        ) {
          matchedColor = group.color;
          if (item.icon) matchedIcon = item.icon;
          break;
        }
      }
      if (matchedColor) break;
    }
  }
  if (!matchedColor) {
    if (/(agua|banheiro|lanche|almoco|pessoal|cafe)/.test(norm)) {
      matchedColor = '#ea580c';
    } else if (/(atend|whatsapp|proc|teste|telecom|operac)/.test(norm)) {
      matchedColor = '#2563eb';
    } else if (/(meeting|reuniao|demo|instal|trein|externo|representante)/.test(norm)) {
      matchedColor = '#7c3aed';
    }
  }
  if (matchedColor === '#ea580c') {
    return { category: 'personal', color: '#ea580c', bg: '#fff7ed', border: '#fdba74', text: '#9a3412', icon: matchedIcon };
  }
  if (matchedColor === '#2563eb') {
    return { category: 'operational', color: '#2563eb', bg: '#eff6ff', border: '#93c5fd', text: '#1e3a8a', icon: matchedIcon };
  }
  if (matchedColor === '#7c3aed') {
    return { category: 'external', color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', text: '#4c1d95', icon: matchedIcon };
  }
  return { category: 'default', color: '#0284c7', bg: '#f0f9ff', border: '#7dd3fc', text: '#0c4a6e', icon: matchedIcon };
}

function buildPausePillHtml(statusLabel, timeStr, isOverLimit) {
  const visual = getPauseCategoryVisual(statusLabel);
  const styleAttr = isOverLimit
    ? ''
    : ` style="--pause-pill-bg:${visual.bg};--pause-pill-border:${visual.border};--pause-pill-text:${visual.text};--pause-pill-accent:${visual.color};"`;
  const titleText = isOverLimit ? 'Em Pausa (TEMPO LIMITE EXCEDIDO!)' : 'Em Pausa';
  return `<span class="status-text-badge status-5 pause-status-pill pause-cat-${visual.category} ${isOverLimit ? 'alert' : ''}" data-pause-category="${visual.category}"${styleAttr} title="${titleText}" aria-label="Pausa observada: ${escapePanelHtml(statusLabel)}"><span class="badge-detail-label"><i class="${escapePanelHtml(visual.icon)} pause-pill-icon" aria-hidden="true"></i><span class="badge-detail-text">${escapePanelHtml(statusLabel)}</span></span><span class="badge-divider">|</span><span class="badge-time">${escapePanelHtml(timeStr || '00:00')}</span></span>`;
}

function resolveAgentRealPauseState(agent, baseConnection) {
  const stateApi = window.InfoBoardAgentState;
  const connection = baseConnection || (stateApi && typeof stateApi.getAgentConnectionState === 'function'
    ? stateApi.getAgentConnectionState(agent || {})
    : { pauseName: 'Em Pausa', isRealNpxCall: false, isCallActive: false, isPaused: false, isPbxRegistered: false });
  let npxFallback = null;
  if (connection.isPbxRegistered && stateApi && typeof stateApi.getAgentConnectionState === 'function') {
    npxFallback = stateApi.getAgentConnectionState({ ...(agent || {}), pbxStatus: undefined });
  }
  const opStatus = Number(agent?.npxOperational?.status);
  const rawStatus = Number(agent?.status);
  const isExplicitlyDisconnected = rawStatus === 0 || opStatus === 0;
  const isExplicitlyUnpaused = !isExplicitlyDisconnected &&
    (opStatus === 1 || (rawStatus === 1 && opStatus !== -1)) &&
    Number(agent?.paused) === 0 &&
    agent?.paused !== true;
  const hasExplicitNpxPause = !isExplicitlyDisconnected && !isExplicitlyUnpaused && (
    Number(agent?.paused) === 1 ||
    agent?.paused === true ||
    (rawStatus === -1 && opStatus !== 1) ||
    opStatus === -1
  );
  let isPaused = !isExplicitlyUnpaused && Boolean(connection.isPaused || npxFallback?.isPaused || hasExplicitNpxPause);
  let pauseName = (
    (connection.isPaused && connection.pauseName) ||
    (npxFallback?.isPaused && npxFallback.pauseName) ||
    String(agent?.pause_type || agent?.npxOperational?.pauseReason || '').trim() ||
    connection.pauseName ||
    'Em Pausa'
  );

  return {
    connection,
    pauseName,
    isRealNpxCall: Boolean(connection.isRealNpxCall),
    isCallActive: Boolean(connection.isCallActive),
    isPaused
  };
}

// --- LÓGICA DE EVENTOS ANIMADOS ---
let lastEventShowTime = 0;
const EVENT_INTERVAL_MS = 60 * 60 * 1000; // 60 MINUTOS
const EVENT_DURATION_MS = 60 * 1000; // duração do aviso em tela cheia
const EVENT_AVATAR_FALLBACK = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"%3E%3Crect width="96" height="96" rx="48" fill="%23e2e8f0"/%3E%3Ccircle cx="48" cy="36" r="18" fill="%2394a3b8"/%3E%3Cpath d="M16 88c4-20 17-30 32-30s28 10 32 30" fill="%2394a3b8"/%3E%3C/svg%3E';
const TRUSTED_EVENT_IMAGE_HOSTS = new Set([
  '192.168.243.2:8888',
  'srv-ads002:8888'
]);

function safeEventImageSrc(src) {
  if (!src) return EVENT_AVATAR_FALLBACK;
  try {
    const url = new URL(String(src), 'http://192.168.243.2:8888/');
    const trustedProtocol = url.protocol === 'http:' || url.protocol === 'https:';
    const trustedHost = TRUSTED_EVENT_IMAGE_HOSTS.has(url.host.toLowerCase());
    if (!trustedProtocol || !trustedHost || url.username || url.password) return EVENT_AVATAR_FALLBACK;
    return url.href;
  } catch {
    return EVENT_AVATAR_FALLBACK;
  }
}

function createEventParticipantNode(participant, index, partyMode) {
  const person = participant && typeof participant === 'object' ? participant : {};
  const hasInfo = Boolean(person.info);
  const wrapper = document.createElement('div');
  wrapper.className = partyMode
    ? `party-bubble${hasInfo ? ' convidado' : ''}`
    : `event-participant-badge${hasInfo ? ' convidado' : ''}`;
  wrapper.style.animationDelay = `${(index % (partyMode ? 4 : 3)) * 0.4}s`;

  const image = document.createElement('img');
  image.src = safeEventImageSrc(person.imgSrc);
  image.alt = String(person.nome || 'Participante');
  image.addEventListener('error', () => {
    if (image.src !== EVENT_AVATAR_FALLBACK) image.src = EVENT_AVATAR_FALLBACK;
  }, { once: true });
  wrapper.appendChild(image);

  const name = document.createElement('span');
  if (partyMode) name.className = 'name-tag';
  name.textContent = String(person.nome || 'Participante');
  wrapper.appendChild(name);

  if (hasInfo) {
    const info = document.createElement(partyMode ? 'span' : 'small');
    if (partyMode) info.className = 'info-tag';
    info.textContent = String(person.info);
    wrapper.appendChild(info);
  }

  return wrapper;
}

function checkEventOverlay(dashData) {
  const eventos = dashData?.horarios?.eventos;
  if (!Array.isArray(eventos) || eventos.length === 0) return;

  const evento = eventos[0];
  if (!evento || typeof evento.data_titulo !== 'string') return;
  const dateMatch = evento.data_titulo.match(/^(\d{2})\/(\d{2})(?:\/(\d{4}))?/);

  // Só exibe se for HOJE
  if (dateMatch) {
     const day = parseInt(dateMatch[1], 10);
     const month = parseInt(dateMatch[2], 10);
     const year = dateMatch[3] ? parseInt(dateMatch[3], 10) : new Date().getFullYear();
     const evtDate = new Date(year, month - 1, day);
     const today = new Date();

     if (evtDate.getDate() !== today.getDate() || evtDate.getMonth() !== today.getMonth() || evtDate.getFullYear() !== today.getFullYear()) {
         return; // Não é hoje, então não exibe na tela inteira
     }
  }

  const now = Date.now();
  if (now - lastEventShowTime > EVENT_INTERVAL_MS) {
    lastEventShowTime = now;
    showEventOverlay(evento);
  }
}








function showEventOverlay(evento) {
  let title = evento.data_titulo || 'Evento';
  let dateText = '';

  if (title.includes('—')) {
    const parts = title.split('—'); dateText = parts[0].trim(); title = parts[1].trim();
  } else if (title.includes('-')) {
    const parts = title.split('-'); dateText = parts[0].trim(); title = parts[1].trim();
  }

  // Lógica para transformar a data em "HOJE!" se for a data atual
  if (dateText) {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const todayString = `${dd}/${mm}/${yyyy}`;

    // Testa se a string da data contém a data de hoje (ex: '02/10/2026')
    if (dateText.includes(todayString) || dateText.includes(`${dd}/${mm}`)) {
      dateText = 'HOJE!';
    }
  }

  const grid = document.getElementById('event-overlay-participants');
  const overlay = document.getElementById('event-overlay');
  const content = document.querySelector('.event-overlay-content');

  const isParty = title.toLowerCase().includes('happy hour') || title.toLowerCase().includes('churrasco') || (evento.obs && evento.obs.toLowerCase().includes('churrasco'));

  if (isParty) {
    overlay.style.background = 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)';
    overlay.style.justifyContent = 'center';
    overlay.style.paddingTop = '0';

    content.style.background = 'transparent';
    content.style.boxShadow = 'none';
    content.style.border = 'none';
    content.style.backdropFilter = 'none';

    // Remove o ícone grande do topo
    const iconDiv = document.querySelector('.event-icon');
    if (iconDiv) {
      iconDiv.innerHTML = '';
      iconDiv.style.marginBottom = '0';
    }

    const dateDiv = document.getElementById('event-overlay-date');
    dateDiv.className = '';
    const isHoje = dateText === 'HOJE!';
    dateDiv.style.cssText = isHoje
      ? 'background: #ea580c; color: #fff; padding: 6px 25px; border-radius: 30px; font-weight: 900; letter-spacing: 2px; font-size: 1.3rem; display: inline-block; margin-bottom: 25px; box-shadow: 0 4px 15px rgba(234, 88, 12, 0.4); border: 2px solid rgba(255,255,255,0.3); animation: pulseDate 2s infinite;'
      : 'background: rgba(0,0,0,0.15); color: #fff; padding: 6px 20px; border-radius: 30px; font-weight: 700; letter-spacing: 1px; font-size: 1.1rem; display: inline-block; margin-bottom: 25px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); border: 2px solid rgba(255,255,255,0.15);';

    dateDiv.textContent = isHoje ? dateText : ('🗓️ ' + dateText);

    // Coloca os emojis nas laterais e faz o título principal ser MUITO mais chamativo
    const titleElement = document.getElementById('event-overlay-title');
    titleElement.textContent = '';
    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:30px;margin-bottom:30px;';
    const leftEmoji = document.createElement('span');
    leftEmoji.style.cssText = 'font-size:7rem;filter:drop-shadow(0 5px 15px rgba(194,65,12,0.4));animation:partyBounce 2s infinite alternate;';
    leftEmoji.textContent = '🍻';
    const partyTitle = document.createElement('span');
    partyTitle.className = 'party-flashy-title';
    partyTitle.textContent = title;
    const rightEmoji = document.createElement('span');
    rightEmoji.style.cssText = 'font-size:7rem;filter:drop-shadow(0 5px 15px rgba(194,65,12,0.4));animation:partyBounce 2s infinite alternate;animation-delay:0.5s;';
    rightEmoji.textContent = '🍖';
    titleRow.append(leftEmoji, partyTitle, rightEmoji);
    titleElement.appendChild(titleRow);

    titleElement.classList.remove('event-title-glow');
    document.getElementById('event-overlay-details').textContent = '';

    const obsDiv = document.getElementById('event-overlay-obs');
    obsDiv.className = '';
    obsDiv.style.cssText = 'font-size: 1.6rem; color: #fff; background: rgba(0,0,0,0.15); padding: 10px 30px; border-radius: 30px; font-weight: bold; margin-bottom: 35px; display: inline-block; box-shadow: 0 5px 15px rgba(0,0,0,0.1); border: 2px solid rgba(255,255,255,0.15);';
    obsDiv.textContent = evento.obs || 'Bora comemorar! 🎉';

    grid.style.display = 'block';

    grid.innerHTML = `
      <style>
        .party-flashy-title {
          font-size: 8rem;
          font-weight: 900;
          text-transform: uppercase;
          background: linear-gradient(90deg, #fffbeb 0%, #fef08a 50%, #fde047 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0px 8px 15px rgba(194, 65, 12, 0.6)) drop-shadow(0px 0px 30px rgba(250, 204, 21, 0.5));
          letter-spacing: -2px;
          line-height: 1.1;
          animation: textPulse 2.5s infinite alternate;
        }

        .party-bubble-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 30px; margin-top: 20px; max-width: 1100px; margin-left: auto; margin-right: auto; }
        .party-bubble { display: flex; flex-direction: column; align-items: center; animation: floatBubble 3s ease-in-out infinite alternate; position: relative; }
        .party-bubble img { width: 95px; height: 95px; border-radius: 50%; border: 5px solid #fff; box-shadow: 0 12px 25px rgba(194, 65, 12, 0.4); object-fit: cover; background: #fff; }
        .party-bubble .name-tag { background: #fff; color: #c2410c; padding: 5px 18px; border-radius: 20px; font-size: 1.05rem; font-weight: 800; margin-top: -15px; z-index: 2; box-shadow: 0 5px 15px rgba(194, 65, 12, 0.2); white-space: nowrap; }
        .party-bubble.convidado img { border-color: #fef08a; }
        .party-bubble.convidado .name-tag { background: #fef08a; color: #854d0e; }
        .party-bubble.convidado .info-tag { position: absolute; top: -10px; right: -15px; background: #ef4444; color: white; font-size: 0.75rem; padding: 4px 10px; border-radius: 12px; font-weight: 900; transform: rotate(15deg); box-shadow: 0 4px 10px rgba(0,0,0,0.2); }
        .festive-bg { position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: -1; background-image: radial-gradient(circle at 10% 20%, rgba(255,255,255,0.4) 4px, transparent 5px), radial-gradient(circle at 80% 40%, rgba(255,255,255,0.3) 6px, transparent 7px), radial-gradient(circle at 30% 70%, rgba(255,255,255,0.4) 3px, transparent 4px), radial-gradient(circle at 90% 80%, rgba(255,255,255,0.3) 5px, transparent 6px), radial-gradient(circle at 50% 10%, rgba(255,255,255,0.2) 8px, transparent 9px); background-size: 150px 150px; animation: driftBg 15s linear infinite; }

        @keyframes floatBubble { 0% { transform: translateY(0px); } 100% { transform: translateY(-20px); } }
        @keyframes driftBg { 0% { background-position: 0 0; } 100% { background-position: 150px -150px; } }
        @keyframes partyBounce { 0% { transform: scale(1) translateY(0); } 100% { transform: scale(1.1) translateY(-10px); } }
        @keyframes pulseDate { 0% { transform: scale(1); box-shadow: 0 4px 15px rgba(234, 88, 12, 0.4); } 50% { transform: scale(1.05); box-shadow: 0 4px 25px rgba(234, 88, 12, 0.8); } 100% { transform: scale(1); box-shadow: 0 4px 15px rgba(234, 88, 12, 0.4); } }
        @keyframes textPulse { 0% { transform: scale(1); filter: drop-shadow(0px 8px 15px rgba(194, 65, 12, 0.6)) drop-shadow(0px 0px 20px rgba(250, 204, 21, 0.5)); } 100% { transform: scale(1.05); filter: drop-shadow(0px 15px 25px rgba(194, 65, 12, 0.8)) drop-shadow(0px 0px 40px rgba(250, 204, 21, 0.9)); } }
      </style>
      <div class="festive-bg"></div>
      <div class="party-bubble-grid"></div>
    `;

    const bubbleGrid = grid.querySelector('.party-bubble-grid');
    if (evento.participantes && evento.participantes.length > 0) {
      evento.participantes.forEach((p, index) => {
        bubbleGrid.appendChild(createEventParticipantNode(p, index, true));
      });
    }
  } else {
    const dateDiv = document.getElementById('event-overlay-date');
    dateDiv.className = 'event-date-tag';
    dateDiv.style.cssText = '';
    dateDiv.innerText = dateText || 'Em breve';

    document.getElementById('event-overlay-title').textContent = title;

    const detailsElement = document.getElementById('event-overlay-details');
    detailsElement.textContent = '';
    if (evento.status) {
      const status = document.createElement('span');
      status.style.color = '#34d399';
      const statusIcon = document.createElement('i');
      statusIcon.className = 'fa-solid fa-clock';
      statusIcon.setAttribute('aria-hidden', 'true');
      status.append(statusIcon, document.createTextNode(` ${evento.status}`));
      detailsElement.append(status, document.createTextNode(' - '));
    }
    String(evento.detalhes || '').split('|').map(detail => detail.trim()).filter(Boolean).forEach(detail => {
      const detailSpan = document.createElement('span');
      detailSpan.textContent = detail;
      detailsElement.appendChild(detailSpan);
    });

    const obsDiv = document.getElementById('event-overlay-obs');
    obsDiv.className = 'event-overlay-obs';
    obsDiv.style.cssText = '';
    obsDiv.textContent = evento.obs || '';

    const iconDiv = document.querySelector('.event-icon');
    if (iconDiv) { iconDiv.innerHTML = '<i class="fa-solid fa-champagne-glasses"></i>'; iconDiv.style.marginBottom=''; }
    document.getElementById('event-overlay-title').classList.add('event-title-glow');

    overlay.style.background = ''; overlay.style.justifyContent = ''; content.style.background = ''; content.style.boxShadow = ''; content.style.border = '';
    grid.style.display = 'flex';
    grid.innerHTML = '';

    if (evento.participantes && evento.participantes.length > 0) {
      evento.participantes.forEach((p, index) => {
        grid.appendChild(createEventParticipantNode(p, index, false));
      });
    }
  }

  overlay.classList.add('active');
  setTimeout(() => { overlay.classList.remove('active'); }, EVENT_DURATION_MS);
}


// --- BOTAO DISCRETO PARA PAUSAR EVENTOS ---
window.isEventPaused = false;
if (!document.getElementById('pause-events-btn')) {
  const btn = document.createElement('button');
  btn.id = 'pause-events-btn';
  btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
  btn.style.position = 'fixed';
  btn.style.bottom = '15px';
  btn.style.left = '15px';
  btn.style.zIndex = '9999999';
  btn.style.background = 'rgba(255,255,255,0.2)';
  btn.style.border = '1px solid rgba(255,255,255,0.1)';
  btn.style.color = '#fff';
  btn.style.padding = '8px 12px';
  btn.style.borderRadius = '50%';
  btn.style.cursor = 'pointer';
  btn.style.opacity = '0.2';
  btn.style.transition = 'all 0.3s ease';
  btn.title = 'Pausar avisos de evento';

  btn.onmouseover = () => { btn.style.opacity = '1'; btn.style.transform = 'scale(1.1)'; };
  btn.onmouseout = () => {
    btn.style.transform = 'scale(1)';
    btn.style.opacity = window.isEventPaused ? '1' : '0.2';
  };

  btn.onclick = () => {
    window.isEventPaused = !window.isEventPaused;
    if (window.isEventPaused) {
      btn.innerHTML = '<i class="fa-solid fa-play"></i>';
      btn.style.background = 'rgba(239, 68, 68, 0.6)'; // vermelho discreto
      btn.style.opacity = '1';
      btn.title = 'Retomar avisos de evento';
      // Força fechar se estiver aberto
      const overlay = document.getElementById('event-overlay');
      if (overlay) overlay.classList.remove('active');
    } else {
      btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
      btn.style.background = 'rgba(255,255,255,0.2)';
      btn.style.opacity = '0.2';
      btn.title = 'Pausar avisos de evento';
    }
  };
  document.body.appendChild(btn);
}

// Interceptar o checkEventOverlay para obedecer o pause
const oldCheck = checkEventOverlay;
checkEventOverlay = function(dashData) {
  if (window.isEventPaused) return;
  oldCheck(dashData);
};
