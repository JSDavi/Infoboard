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
let pinnedAnalysts = []; // Armazena os nomes dos analistas fixados na tela
let pinPendingAlways = false; // Se verdadeiro, mantém a coluna de pendentes visível mesmo vazia
let carouselPaused = false; // Controla se o carrossel está pausado

// Função para fixar/desafixar uma coluna de analista
window.togglePinAgent = function(name) {
  const index = pinnedAnalysts.indexOf(name);
  if (index > -1) {
    pinnedAnalysts.splice(index, 1);
  } else {
    pinnedAnalysts.push(name);
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
    
    // Filtra quais dos analistas fixados estão ativos
    const activePinnedAgents = busyAgents.filter(a => pinnedAnalysts.includes(a.name));
    
    // Slots ocupados pelas fixações:
    // Todos os analistas fixados compartilham 1 único slot (o wrapper vertical),
    // independente de quantos estejam fixados. Se nenhum fixado, ocupa 0 slots.
    const occupiedSlots = activePinnedAgents.length > 0 ? 1 : 0;
    const rotatingSlotsCount = analystSlotsCount - occupiedSlots;
    
    let maxPages = 1;

    if (rotatingSlotsCount > 0) {
      const rotatingAgents = busyAgents.filter(a => !pinnedAnalysts.includes(a.name));
      maxPages = Math.ceil(rotatingAgents.length / rotatingSlotsCount);
    } else {
      maxPages = 1;
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

// Atualiza o Status de Conexão no Cabeçalho
function setConnectionStatus(service, type, label) {
  const indicator = document.getElementById(`connection-status-${service}`);
  const statusText = document.getElementById(`status-text-${service}`);
  if (!indicator || !statusText) return;
  
  indicator.className = 'status-indicator ' + type;
  statusText.textContent = label;
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
  
  // 2. Colunas de Agentes com suporte a Fixação (Pin) e Carrossel rotativo
  const busyAgents = chatData.agents ? [...chatData.agents]
    .filter(a => a.tickets && a.tickets.length > 0)
    .sort((a, b) => b.tickets.length - a.tickets.length) : [];

  // Filtra quais dos analistas fixados estão ativos atualmente
  const activePinnedAgents = busyAgents.filter(a => pinnedAnalysts.includes(a.name));
  
  // Mantém a ordem dos fixados conforme o array pinnedAnalysts
  activePinnedAgents.sort((a, b) => pinnedAnalysts.indexOf(a.name) - pinnedAnalysts.indexOf(b.name));

  const hasPinned = activePinnedAgents.length > 0;
  const rotatingSlotsCount = analystSlotsCount - (hasPinned ? 1 : 0);

  let rotatingAgents = [];
  if (rotatingSlotsCount > 0) {
    const remainingAgents = busyAgents.filter(a => !pinnedAnalysts.includes(a.name));
    const totalRemaining = remainingAgents.length;
    
    if (totalRemaining > 0) {
      const maxPages = Math.ceil(totalRemaining / rotatingSlotsCount);
      if (chatCarouselIndex >= maxPages) {
        chatCarouselIndex = 0;
      }

      if (totalRemaining <= rotatingSlotsCount) {
        rotatingAgents = remainingAgents;
      } else {
        // Algoritmo Wrap-Around: Preenche todos os slots de coluna sem deixar furos/colunas vazias
        const startIdx = (chatCarouselIndex * rotatingSlotsCount) % totalRemaining;
        for (let i = 0; i < rotatingSlotsCount; i++) {
          const idx = (startIdx + i) % totalRemaining;
          const agentCandidate = remainingAgents[idx];
          if (!rotatingAgents.some(a => a.name === agentCandidate.name)) {
            rotatingAgents.push(agentCandidate);
          }
        }
      }
    }
  }

  // Se houver fixados, renderiza o wrapper vertical ocupando 1 slot de coluna
  if (hasPinned) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-column-vertical-wrapper';
    
    activePinnedAgents.forEach(agent => {
      const col = document.createElement('div');
      col.className = 'chat-column' + (agent.online === false ? ' offline' : '');
      
      const pinIconClass = 'fa-solid fa-thumbtack pinned-active';
      const pinTitle = 'Desafixar coluna';

      col.innerHTML = `
        <div class="chat-column-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="chat-pin-btn" onclick="togglePinAgent('${agent.name}')" title="${pinTitle}">
              <i class="${pinIconClass}"></i>
            </button>
            <span>${agent.name}</span>
          </div>
          <span class="online-badge" style="background:rgba(255,255,255,0.25); color:white;">${agent.tickets.length}</span>
        </div>
        <div class="chat-cards-container pinned-cards-container"></div>
      `;
      
      // Ordena tickets por hora crescente (mais antigo primeiro = maior prioridade)
      const sortedTickets = [...agent.tickets].sort((a, b) => {
        // Compara as strings de tempo HH:MM diretamente (funciona para horários do mesmo dia)
        return (a.time || '').localeCompare(b.time || '');
      });

      const cardsContainer = col.querySelector('.chat-cards-container');
      sortedTickets.forEach(t => {
        const card = document.createElement('div');
        const isSlaAlert = t.timeSec > 1800; // 30 minutos em atendimento sem interação
        card.className = 'chat-kanban-card' + (isSlaAlert ? ' alert-card-sla' : '');
        card.innerHTML = `
          <span class="chat-kanban-client">${t.client}</span>
          <span class="chat-kanban-snippet">${t.msg}</span>
          <div class="chat-kanban-meta">
            <span class="chat-kanban-time ${isSlaAlert ? 'alert' : ''}">${t.time}</span>
            <span class="chat-kanban-sector ${t.sector}">${t.sector.toUpperCase()}</span>
          </div>
        `;
        cardsContainer.appendChild(card);
      });
      wrapper.appendChild(col);
    });
    container.appendChild(wrapper);
  }

  // Renderiza as colunas rotativas restantes nos slots que sobraram
  rotatingAgents.forEach(agent => {
    const col = document.createElement('div');
    col.className = 'chat-column accent-animated' + (agent.online === false ? ' offline' : '');
    
    const pinIconClass = 'fa-solid fa-thumbtack';
    const pinTitle = 'Fixar/Pausar esta coluna';

    col.innerHTML = `
      <div class="chat-column-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="chat-pin-btn" onclick="togglePinAgent('${agent.name}')" title="${pinTitle}">
            <i class="${pinIconClass}"></i>
          </button>
          <span>${agent.name}</span>
        </div>
        <span class="online-badge" style="background:rgba(255,255,255,0.25); color:white;">${agent.tickets.length}</span>
      </div>
      <div class="chat-cards-container"></div>
    `;
    container.appendChild(col);
    
    const cardsContainer = col.querySelector('.chat-cards-container');
    agent.tickets.forEach(t => {
      const card = document.createElement('div');
      const isSlaAlert = t.timeSec > 1800; // 30 minutos em atendimento sem interação
      card.className = 'chat-kanban-card' + (isSlaAlert ? ' alert-card-sla' : '');
      card.innerHTML = `
        <span class="chat-kanban-client">${t.client}</span>
        <span class="chat-kanban-snippet">${t.msg}</span>
        <div class="chat-kanban-meta">
          <span class="chat-kanban-time ${isSlaAlert ? 'alert' : ''}">${t.time}</span>
          <span class="chat-kanban-sector ${t.sector}">${t.sector.toUpperCase()}</span>
        </div>
      `;
      cardsContainer.appendChild(card);
    });
  });
}

// --- RENDERIZAÇÃO E ATUALIZAÇÃO DA UI ---

function updateUI(data) {
  // 1. Atualiza Status de Conexão no topo
  const status = data.status || {};
  
  // Status NPX
  if (status.npx) {
    if (status.npx.isSimulated) {
      setConnectionStatus('npx', 'simulated', 'NPX Simulado');
    } else if (status.npx.authenticated) {
      setConnectionStatus('npx', 'connected', 'NPX Conectado');
    } else {
      setConnectionStatus('npx', 'offline', 'NPX Off');
    }
  } else {
    // Fallback retrocompatibilidade
    if (status.isSimulated) {
      setConnectionStatus('npx', 'simulated', 'NPX Simulado');
    } else {
      setConnectionStatus('npx', 'connected', 'NPX Conectado');
    }
  }

  // Status PRIX
  if (status.prix) {
    if (status.prix.isSimulated) {
      setConnectionStatus('prix', 'simulated', 'PRIX Simulado');
    } else if (status.prix.authenticated) {
      setConnectionStatus('prix', 'connected', 'PRIX Conectado');
    } else {
      setConnectionStatus('prix', 'offline', 'PRIX Off');
    }
  } else {
    setConnectionStatus('prix', 'connected', 'PRIX Conectado');
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
          const isPaused = agent.paused == 1 || agent.status === 5 || agent.status === -1;
          let badgeHtml = '';
          let isOverLimit = false;
          let ramalDisplay = ''; // Garante reset do ramal a cada analista (exibe apenas nos Livres)

          let limitLabel = agent.src || agent.dst || '';
          if (limitLabel && agent.time) {
            const match = limitLabel.match(/_(\d+)(h|')/i);
            if (match) {
              let limitMinutes = parseInt(match[1], 10);
              if (match[2].toLowerCase() === 'h') limitMinutes *= 60;
              
              let currentMinutes = 0;
              const parts = agent.time.split(':').map(Number);
              if (parts.length === 3) currentMinutes = parts[0] * 60 + parts[1] + (parts[2] / 60);
              else if (parts.length === 2) currentMinutes = parts[0] * 60 + parts[1];
              
              if (currentMinutes > limitMinutes) {
                isOverLimit = true;
              }
            }
          }

          if (agent.status === 2) {
            statusClass = 'status-2';
            const isLongCall = agent.duration >= 1800 || (agent.pbxDuration || 0) >= 1800;

            const src = agent.src || '';
            const dst = agent.dst || '';
            const isOutbound = (dst.length >= 8 && src.length < 8) || agent.pbxDirection === 0;
            let dirIcon = isOutbound 
              ? `<span class="dir-badge outbound" title="Chamada Realizada (Saída)"><i class="fa-solid fa-arrow-up-long"></i></span>`
              : `<span class="dir-badge inbound" title="Chamada Recebida (Entrada)"><i class="fa-solid fa-arrow-down-long"></i></span>`;
            
            const numberToShow = (dst.length >= 8 && src.length < 8) ? dst : (src || agent.pbxNumber || 'Em Ligação');

            let formattedTime = agent.time || '00:00';
            if (formattedTime === '00:00' && agent.pbxDuration) {
              const m = Math.floor(agent.pbxDuration / 60);
              const s = agent.pbxDuration % 60;
              formattedTime = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            } else if (formattedTime === '00:00' && agent.pbxDurationStr) {
              formattedTime = agent.pbxDurationStr;
            }

            badgeHtml = `
              <span class="status-text-badge status-2 ${isLongCall ? 'alert' : ''}">
                ${dirIcon}${numberToShow}&nbsp;&nbsp;|&nbsp;&nbsp;<span class="badge-time">${formattedTime}</span>
              </span>
            `;
          } else if (agent.pbxStatus === 'Busy') {
            statusClass = 'status-pbx-busy';
            
            let formattedTime = '00:00';
            if (agent.pbxDuration) {
              const m = Math.floor(agent.pbxDuration / 60);
              const s = agent.pbxDuration % 60;
              formattedTime = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            } else if (agent.pbxDurationStr) {
              formattedTime = agent.pbxDurationStr;
            }
            
            const isLongCall = (agent.pbxDuration || 0) >= 1800;
            const isOutbound = agent.pbxDirection === 0;
            const dirIcon = isOutbound 
              ? `<span class="dir-badge outbound" title="Chamada Realizada (Saída)"><i class="fa-solid fa-arrow-up-long"></i></span>`
              : `<span class="dir-badge inbound" title="Chamada Recebida (Entrada)"><i class="fa-solid fa-arrow-down-long"></i></span>`;

            badgeHtml = `
              <span class="status-text-badge status-2 ${isLongCall ? 'alert' : ''}">
                ${dirIcon}${agent.pbxNumber || 'Ocupado'}&nbsp;&nbsp;|&nbsp;&nbsp;<span class="badge-time">${formattedTime}</span>
              </span>
            `;
          } else if (isPaused) {
            statusClass = 'status-5';
            statusLabel = agent.src || 'Pausa';
            badgeHtml = `<span class="status-text-badge status-5" title="Em Pausa"><i class="fa-solid fa-circle-pause"></i> ${statusLabel}&nbsp;&nbsp;|&nbsp;&nbsp;<span class="badge-time">${agent.time || '00:00'}</span></span>`;
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

          card.addEventListener('click', (e) => {
            if (e.target.closest('.status-text-badge') || e.target.closest('.penalty-tag')) return;
            card.classList.toggle('active');
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

window.addEventListener('resize', checkFullscreen);
document.addEventListener('fullscreenchange', checkFullscreen);
// Execução inicial
checkFullscreen();
