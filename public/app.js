// Configurações e Estado Global do Frontend
const CONFIG = {
  limits: {
    queue: { warning: 2, critical: 4 },
    wait: { warning: 180, critical: 300 } // em segundos
  },
  updateInterval: 3000 // atualiza a cada 3 segundos
};
let previousTotalQueue = 0;
let countdownValue = 5;
let countdownInterval = null;
let chatCarouselIndex = 0; // Controla qual página de atendentes do chat está ativa
let lastChatData = null; // Armazena a última resposta real obtida do PrixChat
// Agrupamento por Slots (0 = Esquerda, 1 = Centro, 2 = Direita) e Modos de Exibição
let chatSlotGroups = JSON.parse(localStorage.getItem('chat_slot_groups') || '{"0":[],"1":[],"2":[]}');
let chatAnalystViewModes = JSON.parse(localStorage.getItem('chat_analyst_view_modes') || '{}');
let pinPendingAlways = false; // Se verdadeiro, mantém a coluna de pendentes visível mesmo vazia
let carouselPaused = false; // Controla se o carrossel está pausado
let expandedAnalysts = new Set(); // Armazena as chaves dos analistas com card expandido por clique

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

  localStorage.setItem('chat_slot_groups', JSON.stringify(chatSlotGroups));
  renderPrixChat(lastChatData);
};

// --- DRAG & DROP DE ANALISTAS DO CHAT (AGRUPAMENTO POR COLUNA) ---
window.handleChatDragStart = function(e, analystName) {
  e.dataTransfer.setData('text/plain', analystName);
  e.dataTransfer.effectAllowed = 'move';
  const col = e.target.closest('.chat-column');
  if (col) {
    setTimeout(() => col.classList.add('chat-dragging'), 0);
  }
};

window.handleChatDragEnd = function(e) {
  document.querySelectorAll('.chat-dragging').forEach(el => el.classList.remove('chat-dragging'));
  document.querySelectorAll('.chat-drag-over').forEach(el => el.classList.remove('chat-drag-over'));
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
  if (!draggedName) return;

  // Remove draggedName de todos os slots onde já estava
  for (let s in chatSlotGroups) {
    chatSlotGroups[s] = (chatSlotGroups[s] || []).filter(name => name !== draggedName);
  }

  if (!chatSlotGroups[slotIndex]) {
    chatSlotGroups[slotIndex] = [];
  }

  // Se soltou em cima de outro analista, garante que o alvo também fique fixado neste slot
  if (targetAnalystName && targetAnalystName !== draggedName) {
    for (let s in chatSlotGroups) {
      if (parseInt(s) !== slotIndex) {
        chatSlotGroups[s] = (chatSlotGroups[s] || []).filter(name => name !== targetAnalystName);
      }
    }
    if (!chatSlotGroups[slotIndex].includes(targetAnalystName)) {
      chatSlotGroups[slotIndex].push(targetAnalystName);
    }
  }

  // Adiciona o analista arrastado no slot
  if (!chatSlotGroups[slotIndex].includes(draggedName)) {
    chatSlotGroups[slotIndex].push(draggedName);
  }

  localStorage.setItem('chat_slot_groups', JSON.stringify(chatSlotGroups));
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
  startCountdownTimer();

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
    const chatData = lastChatData || mockPrixChatData;
    const pendingCount = chatData.pending ? chatData.pending.length : 0;
    const showPending = pendingCount > 0 || pinPendingAlways;
    const analystSlotsCount = showPending ? 2 : 3;

    const busyAgents = chatData.agents ? chatData.agents.filter(a => a.tickets && a.tickets.length > 0) : [];
    
    // Identifica analistas fixados em qualquer slot
    const allPinned = [];
    for (let s = 0; s < analystSlotsCount; s++) {
      const inSlot = (chatSlotGroups[s] || []).filter(name => busyAgents.some(a => a.name === name));
      allPinned.push(...inSlot);
    }

    const availableRotating = busyAgents.filter(a => !allPinned.includes(a.name));
    
    let freeSlotsCount = 0;
    for (let s = 0; s < analystSlotsCount; s++) {
      const inSlot = (chatSlotGroups[s] || []).filter(name => busyAgents.some(a => a.name === name));
      if (inSlot.length === 0) freeSlotsCount++;
    }

    let maxPages = 1;
    if (freeSlotsCount > 0 && availableRotating.length > 0) {
      maxPages = Math.ceil(availableRotating.length / freeSlotsCount) || 1;
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

// Temporizador visual regressivo no rodapé
function startCountdownTimer() {
  const countdownLabel = document.getElementById('countdown-label');
  countdownValue = CONFIG.updateInterval / 1000;
  
  if (countdownInterval) clearInterval(countdownInterval);
  
  countdownInterval = setInterval(() => {
    countdownValue--;
    if (countdownValue < 0) {
      countdownValue = CONFIG.updateInterval / 1000;
    }
    countdownLabel.textContent = countdownValue;
  }, 1000);
}

// Busca os dados do servidor local (sempre forçando requisição nova sem cache)
async function fetchData() {
  try {
    const response = await fetch(`/api/data?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Erro na resposta do integrador');
    
    const data = await response.json();
    lastChatData = data.prixchat; // Persiste os dados reais de chat na variável global
    updateUI(data);
    startCountdownTimer(); // Reinicia o cronômetro visual
  } catch (error) {
    console.error('[Wallboard TV] Falha ao obter dados:', error);
    setConnectionStatus('npx', 'offline', 'NPX Off');
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
  
  // Se realData estiver presente (e tiver pendentes ou agentes), usa realData. Caso contrário, usa mock de fallback.
  const chatData = realData || mockPrixChatData;
  
  const pendingCount = chatData.pending ? chatData.pending.length : 0;
  let activeCount = 0;
  
  if (chatData.agents) {
    chatData.agents.forEach(a => {
      activeCount += a.tickets ? a.tickets.length : 0;
    });
  }
  
  // Atualiza métricas e cabeçalho
  document.getElementById('chat-summary-count').textContent = `${activeCount} Ativos`;
  document.getElementById('chat-kpi-pending').textContent = pendingCount;
  document.getElementById('chat-kpi-active').textContent = activeCount;
  document.getElementById('chat-kpi-tmr').textContent = '02:15';
  
  // Destaca o card KPI de Pendentes se houver fila
  const pendingKpiCard = document.getElementById('chat-kpi-pending').parentElement;
  if (pendingKpiCard) {
    if (pendingCount > 0) {
      pendingKpiCard.classList.add('alert');
    } else {
      pendingKpiCard.classList.remove('alert');
    }
  }
  
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
        card.className = 'chat-kanban-card' + (isSlaAlert ? ' alert-card-sla' : '');
        card.innerHTML = `
          <span class="chat-kanban-client">${t.client}</span>
          <span class="chat-kanban-snippet">${t.msg}</span>
          <div class="chat-kanban-meta">
            <span class="chat-kanban-time ${isSlaAlert ? 'alert' : ''}">${t.time}</span>
            <span class="chat-kanban-sector ${t.sector}">${t.sector.toUpperCase()}</span>
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
    col.setAttribute('draggable', 'true');
    col.setAttribute('ondragstart', `handleChatDragStart(event, '${agent.name}')`);
    col.setAttribute('ondragend', `handleChatDragEnd(event)`);
    col.setAttribute('ondragover', `handleChatDragOver(event)`);
    col.setAttribute('ondragleave', `handleChatDragLeave(event)`);
    col.setAttribute('ondrop', `handleChatDrop(event, ${slotIndex}, '${agent.name}')`);

    const pinIconClass = isPinned ? 'fa-solid fa-thumbtack pinned-active' : 'fa-solid fa-thumbtack';
    const pinTitle = isPinned ? 'Desafixar coluna (voltar ao carrossel)' : 'Fixar nesta coluna';
    const modeTitle = isCompact ? 'Mudar para cartões completos' : 'Agrupar em lista compacta';
    const modeIcon = isCompact ? 'fa-table-cells-large' : 'fa-list-ul';

    col.innerHTML = `
      <div class="chat-column-header">
        <div style="display: flex; align-items: center; gap: 6px;">
          <button class="chat-pin-btn" onclick="togglePinAgent('${agent.name}', event)" title="${pinTitle}">
            <i class="${pinIconClass}"></i>
          </button>
          <button class="chat-view-mode-btn ${isCompact ? 'active' : ''}" onclick="toggleAnalystViewMode('${agent.name}', event)" title="${modeTitle}">
            <i class="fa-solid ${modeIcon}"></i>
          </button>
          <span class="chat-header-name" title="Clique e arraste para agrupar em outra coluna">${agent.name}</span>
        </div>
        <span class="online-badge" style="background:rgba(255,255,255,0.25); color:white;">${agent.tickets ? agent.tickets.length : 0}</span>
      </div>
      <div class="chat-cards-container ${isGrouped ? 'pinned-cards-container' : ''}"></div>
    `;

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
      const card = document.createElement('div');

      if (isCompact) {
        card.className = 'chat-compact-card' + (isSlaAlert ? ' alert-card-sla' : '');
        card.title = `${t.client} | ${t.msg || 'Sem mensagens recentes'}`;
        card.innerHTML = `
          <span class="chat-compact-client" title="${t.client}">${t.client}</span>
          <span class="chat-compact-time ${isSlaAlert ? 'alert' : ''}">${t.time}</span>
          <span class="chat-compact-sector ${t.sector}">${t.sector.toUpperCase()}</span>
        `;
      } else {
        card.className = 'chat-kanban-card' + (isSlaAlert ? ' alert-card-sla' : '');
        card.innerHTML = `
          <span class="chat-kanban-client">${t.client}</span>
          <span class="chat-kanban-snippet">${t.msg}</span>
          <div class="chat-kanban-meta">
            <span class="chat-kanban-time ${isSlaAlert ? 'alert' : ''}">${t.time}</span>
            <span class="chat-kanban-sector ${t.sector}">${t.sector.toUpperCase()}</span>
          </div>
        `;
      }
      cardsContainer.appendChild(card);
    });

    return col;
  }

  // Mapeia todos os analistas fixados em qualquer slot
  const allPinnedNames = [];
  for (let s = 0; s < analystSlotsCount; s++) {
    const inSlot = (chatSlotGroups[s] || []).filter(name => busyAgents.some(a => a.name === name));
    allPinnedNames.push(...inSlot);
  }

  // Analistas rotativos disponíveis
  const availableRotatingAgents = busyAgents.filter(a => !allPinnedNames.includes(a.name));

  // Identifica slots livres (sem analistas fixados)
  const freeSlots = [];
  for (let s = 0; s < analystSlotsCount; s++) {
    const activeInSlot = (chatSlotGroups[s] || []).filter(name => busyAgents.some(a => a.name === name));
    if (activeInSlot.length === 0) {
      freeSlots.push(s);
    }
  }

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
    slotZone.setAttribute('ondragover', 'handleChatDragOver(event)');
    slotZone.setAttribute('ondragleave', 'handleChatDragLeave(event)');
    slotZone.setAttribute('ondrop', `handleChatDrop(event, ${slotIdx})`);

    const activeInSlot = (chatSlotGroups[slotIdx] || []).filter(name => busyAgents.some(a => a.name === name));

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
function categorizeError(errText, tagLabel) {
  const text = (errText || '').toLowerCase();
  const tagHtml = `<span class="alert-tag-badge">${tagLabel}</span>`;
  
  if (text.includes('401') || text.includes('403') || text.includes('login') || text.includes('senha') || text.includes('credencial') || text.includes('unauthorized')) {
    return {
      type: 'auth',
      className: 'alert-banner-auth',
      iconHtml: '<i class="fa-solid fa-key"></i>',
      msg: `${tagHtml} 🔑 FALHA DE LOGIN: E-mail ou senha incorretos.`
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
    msg: `${tagHtml} 📡 CONEXÃO OSCILOU: Reconectando à API do NPX automaticamente...`
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
  // 1. Atualiza Status de Conexão no topo e no rodapé (F11)
  const status = data.status || {};
  const alertBanner = document.getElementById('npx-alert-banner');
  const alertMsg = document.getElementById('npx-alert-message');

  let npxErrorMsg = null;
  let pbxErrorMsg = null;
  let prixErrorMsg = null;

  // Status NPX (Infobrasil NPX)
  if (status.npx) {
    const errText = status.npx.error || '';
    if (status.npx.isSimulated || !status.npx.authenticated || errText) {
      npxErrorMsg = errText || 'Desconectado';
      const errCodeMatch = errText.match(/\b\d{3}\b/);
      const errLabel = errCodeMatch ? `NPX ERRO ${errCodeMatch[0]}` : 'NPX OFF';
      const errClass = getErrorStateClass(errText);
      setConnectionStatus('npx', errClass, errLabel);
    } else {
      setConnectionStatus('npx', 'connected', 'NPX');
    }
  } else {
    setConnectionStatus('npx', 'connected', 'NPX');
  }

  // Status PBX (Nossa Tel PBX)
  if (status.pbx) {
    const errText = status.pbx.error || '';
    if (status.pbx.authenticated === false || errText) {
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
    setConnectionStatus('pbx', 'connected', 'PBX');
  }

  // Status PRIX (PrixChat)
  if (status.prix) {
    const errText = status.prix.error || '';
    if (status.prix.isSimulated || !status.prix.authenticated || errText) {
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
    setConnectionStatus('prix', 'connected', 'PRIX');
  }

  // Gerencia a exibição do Banner Inteligente de Alerta com Selo da Plataforma
  const activeErrInfo = npxErrorMsg ? categorizeError(npxErrorMsg, '<i class="fa-solid fa-phone"></i> INFOBRASIL NPX') :
                        pbxErrorMsg ? categorizeError(pbxErrorMsg, '<i class="fa-solid fa-phone-volume"></i> NOSSATEL PBX') :
                        prixErrorMsg ? categorizeError(prixErrorMsg, '<i class="fa-brands fa-whatsapp"></i> PRIXCHAT') : null;

  if (alertBanner) {
    if (activeErrInfo) {
      alertBanner.className = `npx-alert-banner ${activeErrInfo.className}`;
      if (alertMsg) {
        alertMsg.innerHTML = `${activeErrInfo.iconHtml} &nbsp; ${activeErrInfo.msg}`;
      }
    } else {
      alertBanner.className = 'npx-alert-banner hidden';
    }
  }

  // 2. Renderiza o Widget SEFAZ Fiscal
  if (data.sefaz) {
    renderSefazWidget(data.sefaz);
  }

  let currentTotalQueue = 0;

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

    currentTotalQueue += (deptData.queue || 0);
    const prefix = domInfo.prefix;

    // Fila e Tempo de Espera
    const queueEl = document.getElementById(`${prefix}-queue`);
    const waitEl = document.getElementById(`${prefix}-wait`);
    const queueBar = document.getElementById(`${prefix}-queue-bar`);

    // Atualiza valores
    if (queueEl) queueEl.textContent = deptData.queue;
    if (waitEl) waitEl.textContent = formatTime(deptData.wait_time_sec);

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
            <span><i class="fa-solid fa-phone-volume"></i> ${call.client}</span>
            <span class="wait-duration-badge">${formatTime(call.time_sec)}</span>
          `;
          waitingList.appendChild(item);
        });
      } else if (waitingSection) {
        waitingSection.style.display = 'none';
      }
    }

    // --- SEÇÃO DE ANALISTAS ---
    const analystsList = document.getElementById(`${prefix}-analysts-list`);
    if (analystsList) {
      analystsList.innerHTML = '';
      const agents = deptData.agents || [];

      if (agents.length === 0) {
        analystsList.innerHTML = `<div class="no-analysts">Sem analistas logados</div>`;
      } else {
        // Hierarquia Rígida de Blocos:
        // 1. Ocupado NPX (Vermelho Sólido)
        // 2. Ocupado PBX (Vermelho Claro)
        // 3. Pausado (Azul)
        // 4. Livre NPX (Verde Sólido)
        // 5. Livre PBX (Verde Claro / Borda)
        // 6. Offline (Cinza)
        agents.sort((a, b) => {
          const isPausedA = a.paused == 1 || a.status === 5 || a.status === -1;
          const isPausedB = b.paused == 1 || b.status === 5 || b.status === -1;
          
          const getPriority = (agent, isPaused) => {
            if (isPaused) {
              return 3; // 3. Pausado (Azul)
            }
            
            if (agent.status === 2) {
              return 1; // 1. Ocupado NPX (Vermelho Sólido)
            }
            
            if (agent.pbxStatus === 'Busy') {
              return 2; // 2. Ocupado PBX (Vermelho Claro)
            }
            
            if (agent.status === 1) {
              return 4; // 4. Livre NPX (Verde Sólido)
            }
            
            if (agent.pbxStatus === 'Free') {
              return 5; // 5. Livre PBX (Verde Claro / Borda)
            }
            
            return 6; // 6. Offline (Cinza)
          };
          
          const priorityA = getPriority(a, isPausedA);
          const priorityB = getPriority(b, isPausedB);
          
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
          let statusLabel = 'Offline';
          // Identifica se agent.src ou agent.dst contém o nome de uma Pausa do NPX (ex: DemoRemota_3h, WhatsApp_45', etc)
          const srcText = agent.src || '';
          const dstText = agent.dst || '';
          const isSrcPauseName = srcText && /[a-zA-Z_]/i.test(srcText) && !srcText.startsWith('8520') && !srcText.startsWith('8530') && !srcText.startsWith('085');
          const isDstPauseName = dstText && /[a-zA-Z_]/i.test(dstText) && !dstText.startsWith('8520') && !dstText.startsWith('8530') && !dstText.startsWith('085');

          const pauseName = (isSrcPauseName ? srcText : (isDstPauseName ? dstText : (agent.pause_name || 'Pausa')));

          // Função para validar se uma string é um número real de cliente (e não código interno/ramal/pausa)
          const isRealClientPhone = (val) => {
            if (!val) return false;
            const str = String(val).trim();
            if (/[a-zA-Z_]/i.test(str) && !str.startsWith('085') && !str.startsWith('85')) return false;
            if (str.startsWith('4422')) return false; // Código interno de fila/agente do NPX (ex: 4422006, 4422023)
            if (str === agent.code || str === agent.extension || str === agent.ramal) return false;
            if (/^20\d{2}$/.test(str)) return false; // Ramal PBX interno
            return str.length >= 8;
          };

          // Uma ligação real existe se o PBX estiver em Busy ou se houver um número real de telefone em dst/src
          const hasRealPhoneSrc = isRealClientPhone(srcText);
          const hasRealPhoneDst = isRealClientPhone(dstText);
          const isRealPbxCall = agent.pbxStatus === 'Busy';
          const isRealNpxCall = (agent.status === 2) && (hasRealPhoneSrc || hasRealPhoneDst);
          const isCallActive = isRealPbxCall || isRealNpxCall;

          const isPaused = agent.paused == 1 || agent.status === 5 || agent.status === -1 || isSrcPauseName || isDstPauseName;

          let isOverLimit = false;
          if (isPaused) {
            const pauseLimit = getPauseLimitSeconds(pauseName);
            const pauseSeconds = agent.duration || parseTimeToSeconds(agent.time);
            isOverLimit = (pauseSeconds >= pauseLimit);
          }

          let ramalDisplay = '';

          // Extrai o número real de telefone para exibir (prioriza número externo)
          let realNumber = '';
          if (agent.pbxNumber && agent.pbxNumber.length >= 8) {
            realNumber = agent.pbxNumber;
          } else if (hasRealPhoneDst) {
            realNumber = dstText;
          } else if (hasRealPhoneSrc) {
            realNumber = srcText;
          } else {
            realNumber = 'Em Ligação';
          }

          // Direção da chamada: 0 = Outbound (Saída), 1 = Inbound (Entrada)
          const isOutbound = (dstText.length >= 8 && !isDstPauseName) || agent.pbxDirection === 0;
          const dirIcon = isOutbound 
            ? `<span class="dir-badge outbound" title="Chamada Realizada (Saída)"><i class="fa-solid fa-arrow-up-long"></i></span>`
            : `<span class="dir-badge inbound" title="Chamada Recebida (Entrada)"><i class="fa-solid fa-arrow-down-long"></i></span>`;

          // Tempo e Duração Real da Chamada (separado do tempo de pausa)
          let formattedCallTime = '00:00';
          let callSeconds = 0;
          if (isRealPbxCall) {
            callSeconds = agent.pbxDuration || (agent.pbxDurationStr ? parseTimeToSeconds(agent.pbxDurationStr) : 0);
            if (agent.pbxDurationStr) {
              formattedCallTime = agent.pbxDurationStr;
            } else if (agent.pbxDuration) {
              const m = Math.floor(agent.pbxDuration / 60);
              const s = agent.pbxDuration % 60;
              formattedCallTime = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            }
          } else if (isRealNpxCall) {
            callSeconds = agent.duration || parseTimeToSeconds(agent.time);
            formattedCallTime = agent.time || '00:00';
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
              <span class="status-text-badge status-2 ${isLongCall ? 'alert' : ''}" title="Ligação ativa durante a Pausa (${pauseName}) ${isLongCall ? ' - EXCEDEU 1 HORA!' : ''}">
                ${dirIcon}${realNumber}&nbsp;&nbsp;|&nbsp;&nbsp;<span class="badge-time">${formattedCallTime}</span>
              </span>
            `;
          } else if (isCallActive) {
            statusClass = isRealNpxCall ? 'status-2' : 'status-pbx-busy';

            badgeHtml = `
              <span class="status-text-badge status-2 ${isLongCall ? 'alert' : ''}" title="${isLongCall ? 'ATENDIMENTO EXCEDEU 1 HORA!' : 'Em Ligação'}">
                ${dirIcon}${realNumber}&nbsp;&nbsp;|&nbsp;&nbsp;<span class="badge-time">${formattedCallTime}</span>
              </span>
            `;
          } else if (isPaused) {
            statusClass = 'status-5';
            statusLabel = pauseName;
            badgeHtml = `<span class="status-text-badge status-5 ${isOverLimit ? 'alert' : ''}" title="Em Pausa (${isOverLimit ? 'TEMPO LIMITE EXCEDIDO!' : 'Dentro do limite'})"><i class="fa-solid fa-circle-pause"></i> ${statusLabel}&nbsp;&nbsp;|&nbsp;&nbsp;<span class="badge-time">${agent.time || '00:00'}</span></span>`;
          } else if (agent.status === 1) {
            statusClass = 'status-1';
            ramalDisplay = agent.code ? (String(agent.code).length > 4 ? String(agent.code).slice(-4) : String(agent.code)) : (agent.ramal || '');
            badgeHtml = `<span class="status-text-badge status-1">Livre</span>`;
          } else if (agent.pbxStatus === 'Free') {
            statusClass = 'status-pbx-free';
            ramalDisplay = agent.pbxNumber || agent.ramal || '';
            badgeHtml = `<span class="status-text-badge status-1">Livre</span>`;
          } else {
            card.classList.add('offline-card');
            badgeHtml = `<span class="status-text-badge status-offline">Offline</span>`;
          }

          // Apply the visual status directly to the entire card
          card.classList.add(statusClass);

          if (isOverLimit) card.classList.add('alert-blink');

          const ramalCenterHtml = ramalDisplay ? `<span class="analyst-ramal-center">${ramalDisplay}</span>` : '<span class="analyst-ramal-center"></span>';

          card.innerHTML = `
            <div class="analyst-row-main">
              <div class="analyst-name-info">
                <span class="penalty-tag">${agent.penalty || 1}</span>
                <span class="analyst-name" title="${agent.name}">${agent.name}</span>
              </div>
              ${ramalCenterHtml}
              ${badgeHtml}
            </div>
            <div class="analyst-metrics-drawer">
              <div class="metrics-grid">
                <div class="metric-item">
                  <span class="metric-lbl"><i class="fa-solid fa-right-to-bracket"></i> Logado</span>
                  <span class="metric-val">${agent.total_loged_time || '00:00:00'}</span>
                </div>
                <div class="metric-item">
                  <span class="metric-lbl"><i class="fa-solid fa-circle-pause"></i> Pausado</span>
                  <span class="metric-val">${agent.total_paused_time || '00:00:00'}</span>
                </div>
                <div class="metric-item">
                  <span class="metric-lbl"><i class="fa-solid fa-phone"></i> Atend.</span>
                  <span class="metric-val">${agent.total_call_time || '00:00:00'}</span>
                </div>
                <div class="metric-item">
                  <span class="metric-lbl"><i class="fa-solid fa-mug-hot"></i> Ocioso</span>
                  <span class="metric-val">${agent.total_lazy_time || '00:00:00'}</span>
                </div>
              </div>
            </div>
          `;

          // Mantém expandido se o analista foi clicado previamente
          const agentKey = `${prefix}_${agent.name}`;
          if (expandedAnalysts.has(agentKey)) {
            card.classList.add('active');
          }

          card.addEventListener('click', (e) => {
            if (e.target.closest('.status-text-badge') || e.target.closest('.penalty-tag')) return;
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
  if (data.horarios) {
    const tickerTextEl = document.getElementById('ticker-text');
    if (tickerTextEl) {
      const htmlContent = data.horarios.tickerHtml || data.horarios.tickerText;
      if (tickerTextEl.innerHTML !== htmlContent) {
        tickerTextEl.innerHTML = htmlContent;
      }
    }
  }

  // 7. Efeito Sonoro quando a fila total aumenta
  if (currentTotalQueue > previousTotalQueue) {
    playQueueBeep();
  }
  previousTotalQueue = currentTotalQueue;
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

// --- RENDERIZAÇÃO DO WIDGET SEFAZ RADAR DE PERFORMANCE (OPÇÃO 3) ---
function renderSefazWidget(sefazData) {
  if (!sefazData) return;
  const radarList = document.getElementById('sefaz-radar-list');
  const radarTime = document.getElementById('sefaz-radar-time');
  if (!radarList) return;

  const docs = [
    { key: 'nfe', name: 'NF-e', uf: 'CE', defaultLabel: 'SEFAZ CE' },
    { key: 'nfce', name: 'NFC-e', uf: 'CE', defaultLabel: 'SEFAZ CE' },
    { key: 'cte', name: 'CT-e', uf: 'SVRS', defaultLabel: 'SVRS' },
    { key: 'mdfe', name: 'MDF-e', uf: 'SVRS', defaultLabel: 'SVRS' }
  ];

  let rowsHtml = '';

  docs.forEach(doc => {
    const item = sefazData[doc.key] || { status: 'OK', latency: 110, label: doc.defaultLabel };
    let rowStatusClass = 'status-ok';
    let barClass = 'bar-ok';
    let icon = '<i class="fa-solid fa-circle-check val-icon"></i>';
    let latencyMs = item.latency || 110;
    let latencyText = `${latencyMs}ms`;

    // Calcula a porcentagem da barra (20% a 100%)
    let pct = Math.min(Math.max(Math.round((latencyMs / 450) * 100), 20), 100);

    if (item.status === 'WARNING') {
      rowStatusClass = 'status-warning';
      barClass = 'bar-warning';
      icon = '<i class="fa-solid fa-triangle-exclamation val-icon"></i>';
      latencyText = `${latencyMs}ms`;
      pct = Math.min(Math.max(Math.round((latencyMs / 1500) * 100), 50), 100);
    } else if (item.status === 'DANGER' || item.status === 'OFF') {
      rowStatusClass = 'status-danger';
      barClass = 'bar-danger';
      icon = '<i class="fa-solid fa-circle-xmark val-icon"></i>';
      latencyText = 'FORA';
      pct = 100;
    } else if (item.status === 'CONTINGENCY') {
      rowStatusClass = 'status-contingency';
      barClass = 'bar-contingency';
      icon = '<i class="fa-solid fa-shield-halved val-icon"></i>';
      latencyText = 'Conting.';
      pct = 80;
    }

    const titleText = `${doc.name} (${item.label || doc.defaultLabel}): ${item.status === 'OK' ? 'Operacional' : item.status}`;

    rowsHtml += `
      <div class="sefaz-radar-row ${rowStatusClass}" title="${titleText}">
        <div class="radar-row-info">
          <span class="doc-badge">${doc.name}</span>
          <span class="uf-tag">(${doc.uf})</span>
        </div>
        <div class="radar-bar-container">
          <div class="radar-bar-fill ${barClass}" style="width: ${pct}%;"></div>
        </div>
        <div class="radar-row-val">
          ${icon}
          <span class="latency-text">${latencyText}</span>
        </div>
      </div>
    `;
  });

  radarList.innerHTML = rowsHtml;

  const globalBadge = document.getElementById('sefaz-global-badge');
  if (globalBadge) {
    const hasDanger = Object.values(sefazData).some(d => d && (d.status === 'DANGER' || d.status === 'OFF'));
    const hasWarning = Object.values(sefazData).some(d => d && d.status === 'WARNING');

    if (hasDanger) {
      globalBadge.className = 'sefaz-global-badge status-danger';
      globalBadge.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> FORA DO AR';
    } else if (hasWarning) {
      globalBadge.className = 'sefaz-global-badge status-warning';
      globalBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> INSTÁVEL';
    } else {
      globalBadge.className = 'sefaz-global-badge status-ok';
      globalBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> TUDO OK';
    }
  }

  if (radarTime) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    radarTime.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }
}

window.addEventListener('resize', checkFullscreen);
document.addEventListener('fullscreenchange', checkFullscreen);
// Execução inicial
checkFullscreen();
