// Diagnóstico de integração do painel usando Chrome em modo headless.
// Uso: node tests/browser-smoke.cjs http://127.0.0.1:3001/ [largura] [altura]
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const target = process.argv[2] || 'http://127.0.0.1:3001/';
const width = Number(process.argv[3]) || 1920;
const height = Number(process.argv[4]) || 1080;
const outputDirectory = path.resolve(process.env.INFOBOARD_SMOKE_OUTPUT_DIR || path.join(__dirname, '..', 'artifacts', 'browser-smoke'));
fs.mkdirSync(outputDirectory, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'infoboard-chrome-'));
const browser = spawn(chromePath, [
  '--headless=new', '--no-first-run', '--disable-extensions', '--disable-gpu',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  '--remote-debugging-port=0', `--window-size=${width},${height}`, 'about:blank'
], { stdio: 'ignore' });

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  let tab;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const portFile = path.join(profile, 'DevToolsActivePort');
      if (!fs.existsSync(portFile)) { await wait(300); continue; }
      const port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]);
      if (!Number.isInteger(port) || port <= 0) throw new Error('Porta CDP inválida');
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      const pages = await response.json();
      tab = pages.find(page => page.type === 'page');
      if (tab) break;
    } catch {}
    await wait(300);
  }
  if (!tab) throw new Error('Chrome DevTools não iniciou');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const pending = new Map();
  const errors = [];
  let serial = 0;
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const e = msg.params.exceptionDetails;
      errors.push(`${e.text}: ${e.exception?.description || ''}`);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map(arg => arg.value || arg.description || '').join(' '));
    }
  });
  await ready;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await call('Runtime.enable');
  await call('Page.enable');
  await call('Page.navigate', { url: target });
  await wait(10000);
  const result = await call('Runtime.evaluate', {
    expression: `(() => ({
      status: ['npx','prix','pbx'].map(s => document.getElementById('status-text-' + s)?.textContent),
      voice: document.getElementById('voice-summary-count')?.textContent,
      chat: document.getElementById('chat-summary-count')?.textContent,
      kanban: document.getElementById('chat-kanban-board')?.innerText.slice(0,75),
      ticker: document.getElementById('ticker-text')?.textContent.slice(0,180),
      tutorial: !!document.querySelector('.introjs-overlay'),
      eventActive: !!document.querySelector('#event-overlay.active'),
      scrollWidth: document.documentElement.scrollWidth,
      width: window.innerWidth,
      height: window.innerHeight
    }))()`, returnByValue: true
  });
  // Renderiza estados NPX em memoria, sem chamadas de escrita para o provedor.
  const operationalCardCheck = await call('Runtime.evaluate', {
    expression: `(async () => {
      const data = await (await fetch('/api/data')).json();
      const sample = JSON.parse(JSON.stringify(data));
      sample.status.pbx = { authenticated: true, error: null };
      const [queue, dept] = Object.entries(sample.departments || {})[0] || [];
      if (!dept || !window.InfoBoardAgentState) return { ok: false, reason: 'Falta setor/classificador' };
      const agent = { name: 'QA MONITOR 2002', code: '4422002', ramal: '2002', status: 1, paused: 0,
        npxQueue: queue, pbxStatus: 'Offline', npxQueuePresent: true, npxSipRegistered: null,
        npxRequireSipConfirmation: true, pbxMonitorConfirmed: true,
        npxOperational: { source: 'npx-queue-monitor',
          agentCode: '4422002', queue, status: 0, observedAt: new Date().toISOString() } };
      dept.agents = [agent];
      const show = () => {
        const category = InfoBoardAgentState.getAgentCategory(agent);
        dept.agents_online = category === 'offline' ? 0 : 1;
        dept.agents_free = category === 'free' ? 1 : 0;
        dept.agents_busy = category === 'busy' ? 1 : 0;
        dept.agents_paused = category === 'paused' ? 1 : 0;
        updateUI(sample);
        const card = [...document.querySelectorAll('.analyst-card')].find(c => c.textContent.includes('QA MONITOR 2002'));
        const name = card?.querySelector('.analyst-name');
        return { css: card?.className || '', badge: card?.querySelector('.status-text-badge')?.textContent || '',
          cursor: card ? getComputedStyle(card).cursor : null,
          nameWeight: name ? getComputedStyle(name).fontWeight : '',
          nameColor: name ? getComputedStyle(name).color : '', category };
      };
      try {
        const offline = show();
        agent.npxOperational.status = 1; const free = show();
        agent.npxOperational.status = 2; const busy = show();
        agent.npxOperational.status = 5; const ringing = show();
        agent.npxOperational.status = -1; const paused = show();
        agent.npxOperational.status = 0; const offlineAgain = show();
        sample.status.pbx.authenticated = false; const pbxUnknown = show();
        sample.status.pbx.authenticated = true;
        agent.npxOperational.status = 1;
        agent.npxOperational.observedAt = new Date(Date.now() - 31000).toISOString();
        const stale = show();
        agent.pbxStatus = 'Free'; const pbx = show();
        // Mesmo estado monitorado deve produzir o mesmo card nos cinco setores.
        // As alterações são somente em memória no Chromium descartável de QA.
        const departments = Object.entries(sample.departments || {});
        const snapshots = [];
        sample.status.pbx = { authenticated: true, error: null };
        const expectedClasses = [
          'status-offline', 'status-1', 'status-2', 'status-npx-unverified', 'status-5'
        ];
        for (const statusCode of [0, 1, 2, 5, -1]) {
          const names = [];
          for (const [departmentKey, department] of departments) {
            const name = 'QA UNIFORME ' + departmentKey;
            names.push({ departmentKey, name });
            department.agents = [{ ...agent, name, pbxStatus: 'Offline',
              pbxMonitorConfirmed: true, npxQueue: departmentKey, status: statusCode,
              paused: 0, npxOperational: { source: 'npx-queue-monitor',
                agentCode: '4422002', queue: departmentKey, status: statusCode,
                observedAt: new Date().toISOString() } }];
          }
          updateUI(sample);
          snapshots.push(names.map(({ departmentKey, name }) => {
            const card = [...document.querySelectorAll('.analyst-card')]
              .find(element => element.dataset.agentQueue === departmentKey && element.textContent.includes(name));
            return { departmentKey, css: card?.className || '',
              badge: card?.querySelector('.status-text-badge')?.textContent || '',
              cursor: card ? getComputedStyle(card).cursor : null };
          }));
        }
        const uniformCards = departments.length === 5 && snapshots.every((group, idx) =>
          group.length === 5 && group.every(row => row.css &&
            row.css === group[0].css && row.badge === group[0].badge &&
            row.cursor === 'default' &&
            row.css.includes(expectedClasses[idx]) &&
            (idx !== 0 || row.badge === 'Sem conexão NPX/PBX')));
        const sampleCard = [...document.querySelectorAll('.analyst-card')]
          .find(card => card.textContent.includes('QA UNIFORME'));
        sampleCard?.click();
        const cardClickIgnored = !!sampleCard && !sampleCard.classList.contains('active');
        sampleCard?.querySelector('.details-btn')?.click();
        const metricsIconOpens = !!sampleCard?.classList.contains('active');
        sampleCard?.querySelector('.details-btn')?.click();
        const metricsIconCloses = !!sampleCard && !sampleCard.classList.contains('active');
        return { ok: offline.css.includes('status-offline') && offline.badge === 'Sem conexão NPX/PBX' &&
          free.css.includes('status-1') && free.category === 'free' &&
          busy.css.includes('status-2') && busy.badge === 'Ocupado na NPX' &&
          ringing.badge === 'Chamando' && ringing.category === 'busy' &&
          paused.css.includes('status-5') && paused.category === 'paused' &&
          offlineAgain.css.includes('status-offline') &&
          pbxUnknown.css.includes('status-npx-unverified') && pbxUnknown.badge === 'PBX não confirmado' &&
          pbxUnknown.nameWeight === offline.nameWeight && pbxUnknown.nameColor === offline.nameColor &&
          stale.badge === 'Status NPX não confirmado' && stale.category === 'offline' &&
          pbx.css.includes('status-pbx-free') && pbx.category === 'free' && uniformCards &&
          [offline, free, busy, ringing, paused, offlineAgain, pbxUnknown, stale, pbx]
            .every(state => state.cursor === 'default') &&
          cardClickIgnored && metricsIconOpens && metricsIconCloses,
          offline, free, busy, ringing, paused, offlineAgain, pbxUnknown, stale, pbx,
          uniformCards, cardClickIgnored, metricsIconOpens, metricsIconCloses,
          uniformSnapshots: snapshots };
      } finally { updateUI(data); }
    })()`, awaitPromise: true, returnByValue: true
  });
  if (operationalCardCheck.exceptionDetails || !operationalCardCheck.result?.value?.ok) {
    errors.push('Monitor NPX: ' + (operationalCardCheck.exceptionDetails?.text || JSON.stringify(operationalCardCheck.result?.value)));
  }
  // A API pode retornar horarios: null no primeiro ciclo do servidor.
  const eventGuard = await call('Runtime.evaluate', {
    expression: `(() => {
      checkEventOverlay({ horarios: null });
      checkEventOverlay({ horarios: { eventos: null } });
      checkEventOverlay({ horarios: { eventos: [null] } });
      return true;
    })()`, returnByValue: true
  });
  if (eventGuard.exceptionDetails || eventGuard.result?.value !== true) {
    errors.push(`Event overlay sem dados: ${eventGuard.exceptionDetails?.text || 'falha'}`);
  }
  await call('Runtime.evaluate', { expression: `localStorage.setItem('onboardingCompleted','true'); document.querySelector('.introjs-skipbutton')?.click()`, returnByValue: true });
  await wait(1200);
  let overlayScreenshot = null;
  if (result.result.value.eventActive) {
    const eventPic = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    overlayScreenshot = path.join(outputDirectory, `qa-event-overlay-${width}x${height}.png`);
    fs.writeFileSync(overlayScreenshot, Buffer.from(eventPic.data, 'base64'));
    // Fecha somente na sessão descartável do Chrome de QA.
    await call('Runtime.evaluate', { expression: `document.getElementById('event-overlay')?.classList.remove('active')` });
    await wait(550);
  }
  const pic = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const output = path.join(outputDirectory, `qa-browser-${width}x${height}.png`);
  fs.writeFileSync(output, Buffer.from(pic.data, 'base64'));

  // Confere o painel passivo: nenhum controle operacional e widgets preservados.
  const uiRefinementCheck = await call('Runtime.evaluate', {
    expression: `(() => {
      const removedFunctions = [
        'sendNpxAction', 'openPauseModal', 'closePauseModal', 'quickLoginQueue',
        'saveNpxAuth', 'updateLoginButton', 'closeAuthModal'
      ].filter(name => typeof window[name] === 'function');
      const removedElements = [
        '#npx-pause-modal', '#npx-auth-modal', '#npx-login-btn',
        '#pause-buttons-container', '.pause-option-btn', '[data-npx-action]'
      ].filter(selector => document.querySelector(selector));
      const passwordFields = document.querySelectorAll('input[type=password]').length;
      const beatrixLink = document.getElementById('beatrix-login-btn');
      const beatrixLinkOk = beatrixLink?.href === 'https://agente.npx.app.br/agent_users/sign_in' &&
        beatrixLink?.target === '_blank' &&
        beatrixLink?.getBoundingClientRect().width > 0;
      const sefazCards = [...document.querySelectorAll('#sefaz-radar-list .sefaz-radar-row')];
      const tickerText = document.getElementById('ticker-text')?.textContent || '';
      const bodyText = document.body.innerText;
      const metrics = {
        removedFunctions, removedElements, passwordFields, beatrixLinkOk,
        sefazCount: sefazCards.length,
        hasPulse: !!document.querySelector('.sefaz-pulse'),
        hasTmr: !!document.getElementById('chat-kpi-tmr') || /TMR:\\s*S\\/D/i.test(bodyText),
        hasCountdown: !!document.getElementById('countdown-label') || /Próxima atualização/i.test(bodyText),
        hasSefazMetadata: !!document.getElementById('sefaz-radar-time') ||
          !!document.querySelector('.radar-source-time, .sefaz-radar-footer'),
        tickerLoaded: !!tickerText && !tickerText.includes('Carregando dados da escala')
      };
      return {
        ok: removedFunctions.length === 0 && removedElements.length === 0 &&
          passwordFields === 0 && beatrixLinkOk && sefazCards.length === 4 &&
          !metrics.hasPulse && !metrics.hasTmr && !metrics.hasCountdown &&
          !metrics.hasSefazMetadata && metrics.tickerLoaded,
        metrics
      };
    })()`, returnByValue: true
  });
  if (uiRefinementCheck.exceptionDetails || !uiRefinementCheck.result?.value?.ok) {
    errors.push(`Painel passivo e widgets: ${uiRefinementCheck.exceptionDetails?.text || JSON.stringify(uiRefinementCheck.result?.value)}`);
  }
  console.log(JSON.stringify({ ...result.result.value, operationalCardCheck: operationalCardCheck.result?.value,
    uiRefinementCheck: uiRefinementCheck.result?.value,
    errors, screenshot: output, overlayScreenshot }, null, 2));  ws.close();
  if (result.result.value.ticker?.includes('Carregando dados da escala')) {
    console.error('O ticker permaneceu em estado inicial de carregamento.');
    process.exitCode = 1;
  }
  if (result.result.value.scrollWidth > result.result.value.width || errors.length > 0) process.exitCode = 1;
}

main().catch(e => { console.error('BROWSER_SMOKE_ERROR:', e.message); process.exitCode = 1; })
  .finally(async () => {
    const exited = new Promise(resolve => browser.once('exit', resolve));
    browser.kill();
    await Promise.race([exited, wait(2000)]);
    const temporaryRoot = path.resolve(os.tmpdir());
    const resolvedProfile = path.resolve(profile);
    if (path.dirname(resolvedProfile) !== temporaryRoot || !path.basename(resolvedProfile).startsWith('infoboard-chrome-')) {
      throw new Error('Perfil temporario fora da pasta verificada');
    }
    try { fs.rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
    catch { console.error('Perfil temporario do smoke permaneceu ocupado pelo Chrome.'); }
  });
