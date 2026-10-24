const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const axios = require('axios');
const cheerio = require('cheerio');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function loadHorariosRuntime({ axiosGet, now = new Date(2026, 9, 23, 10, 0, 0) } = {}) {
  const escapeStart = serverSource.indexOf('function escapeHtml(');
  const escapeEnd = serverSource.indexOf('function isWorkingHours(');
  assert.ok(escapeStart > 0 && escapeEnd > escapeStart, 'Helpers escapeHtml/safeTickerImageSrc devem existir em server.js');

  const horariosStart = serverSource.indexOf('// --- INTEGRAÇÃO COM PORTAL DE HORÁRIOS E ESCALAS (SRV-ADS002) ---');
  const horariosEnd = serverSource.indexOf('// --- INTEGRAÇÃO COM SERVIDOR DE HOSPEDAGENS (SRV-ADS002) ---');
  assert.ok(horariosStart > 0 && horariosEnd > horariosStart, 'Bloco de horários deve existir em server.js');

  const scheduledTimers = [];
  class FixedDate extends Date {
    constructor(...args) {
      if (args.length === 0) {
        super(now.getTime());
      } else {
        super(...args);
      }
    }
    static now() {
      return now.getTime();
    }
  }

  const context = {
    cheerio,
    URL,
    Date: FixedDate,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Promise,
    parseInt,
    console: { log() {}, warn() {}, error() {} },
    setTimeout(fn, delay) {
      const id = scheduledTimers.length + 1;
      scheduledTimers.push({ id, fn, delay, cleared: false });
      return id;
    },
    clearTimeout(id) {
      const timer = scheduledTimers.find(t => t.id === id);
      if (timer) timer.cleared = true;
    },
    axios: {
      get: axiosGet || (async () => { throw new Error('offline'); })
    },
    hospedagensCache: {
      items: [],
      tickerHtml: '',
      tickerText: '',
      lastUpdate: null
    }
  };

  vm.createContext(context);
  vm.runInContext(serverSource.slice(escapeStart, escapeEnd), context);
  vm.runInContext(serverSource.slice(horariosStart, horariosEnd), context);
  vm.runInContext('this.__getHorariosCache = () => horariosCache;', context);

  return {
    context,
    scheduledTimers,
    getHorariosCache: () => {
      const raw = context.__getHorariosCache();
      return raw ? JSON.parse(JSON.stringify(raw)) : null;
    }
  };
}

const samplePortalHtml = `
<div id="conteudo-principal" class="pagina-equipe-amarela">
  <div class="card" id="secao-escala-sabado">
    <div class="coluna-turno">
      <div class="coluna-turno-header">⏰ 08:00 às 12:00</div>
      <div class="card-tec"><span class="card-nome">Alisson</span><span class="card-obs"></span></div>
    </div>
    <div class="secao-sobreaviso-box">
      <div class="subcoluna-box">
        <div class="card-tec"><span class="card-nome">Thiago</span></div>
      </div>
      <div class="subcoluna-box">
        <div class="card-tec"><span class="card-nome">Murilo</span></div>
      </div>
    </div>
  </div>

  <div class="card" id="secao-cobertura">
    <h3>📊 Cobertura de Atendimento</h3>
  </div>

  <div class="card" id="secao-escala-domingo">
    <div class="section-header">
      <h3>📱 Escala de Sobreaviso aos Domingos (Plantão TEF)</h3>
    </div>
    <div>
      <div class="card-tec">
        <div><span data-domingo="2026-10-18">📅 18/10/2026</span></div>
        <div>
          <img src="/static/fotos/alisson.jpg" class="card-avatar">
          <div>
            <div title="Alisson">Alisson</div>
            <div>Suporte Técnico</div>
            <div><span class="badge">📱 Sobreaviso TEF</span></div>
          </div>
        </div>
      </div>
      <div class="card-tec">
        <div>
          <span data-domingo="2026-10-25">📅 25/10/2026</span>
          <span class="badge">Próximo Domingo</span>
        </div>
        <div>
          <img src="/static/fotos/carol.jpg" class="card-avatar">
          <div>
            <div title="Carol">Carol</div>
            <div>Suporte Técnico</div>
            <div><span class="badge">📱 Sobreaviso TEF</span></div>
          </div>
        </div>
      </div>
      <div class="card-tec">
        <div><span data-domingo="2026-11-01">📅 01/11/2026</span></div>
        <div>
          <img src="/static/fotos/bruno.jpg" class="card-avatar">
          <div>
            <div title="Bruno">Bruno</div>
            <div>Suporte Técnico</div>
            <div><span class="badge">📱 Sobreaviso TEF</span></div>
          </div>
        </div>
      </div>
      <div class="card-tec">
        <div><span data-domingo="2026-11-08">📅 08/11/2026</span></div>
        <div>
          <img src="/static/fotos/germano.jpg" class="card-avatar">
          <div>
            <div title="Germano">Germano</div>
            <div>Suporte Técnico</div>
            <div><span class="badge">📱 Sobreaviso TEF</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="card" id="secao-ausencias">
    <h3>🏖️ Ausências, Férias e Licenças</h3>
    <table><tr><th>Nome</th><th>Motivo</th><th>Início</th><th>Dias</th><th>Fim</th></tr></table>
  </div>
</div>
`;

test('extrai próximos domingos da Escala de Sobreaviso aos Domingos (Plantão TEF), ignorando domingos passados e incluindo no ticker', async () => {
  const requestedUrls = [];
  const { context, getHorariosCache } = loadHorariosRuntime({
    now: new Date(2026, 9, 23, 10, 0, 0),
    axiosGet: async (url) => {
      requestedUrls.push(url);
      return { status: 200, data: samplePortalHtml };
    }
  });

  await context.fetchHorariosData();
  const cache = getHorariosCache();

  assert.equal(requestedUrls[0], 'http://srv-ads002:8888/horarios?sabado=2026-10-24');
  assert.ok(cache, 'horariosCache deve ser preenchido');
  assert.equal(cache.sobreavisoDomingos.length, 3);
  assert.deepEqual(
    cache.sobreavisoDomingos.map(d => ({ nome: d.nome, data: d.data, dataIso: d.dataIso, proximo: d.proximo })),
    [
      { nome: 'Carol', data: '25/10/2026', dataIso: '2026-10-25', proximo: true },
      { nome: 'Bruno', data: '01/11/2026', dataIso: '2026-11-01', proximo: false },
      { nome: 'Germano', data: '08/11/2026', dataIso: '2026-11-08', proximo: false }
    ]
  );
  assert.ok(!cache.tickerHtml.includes('18/10/2026'), 'Não deve exibir domingo passado no ticker');
  assert.match(cache.pillDomingos, /SOBREAVISO DOMINGOS \(PLANTÃO TEF\):/);
  assert.match(cache.pillDomingos, /<strong>Carol<\/strong> \(25\/10\/2026\) ⬢ <strong>Bruno<\/strong> \(01\/11\/2026\) ⬢ <strong>Germano<\/strong> \(08\/11\/2026\)/);
  assert.ok(cache.tickerHtml.includes(cache.pillDomingos));
  assert.match(cache.tickerText, /SOBREAVISO DOMINGOS \(PLANTÃO TEF\): Carol \(25\/10\/2026\) ⬢ Bruno \(01\/11\/2026\) ⬢ Germano \(08\/11\/2026\)/);
});

test('não inventa Carol nem emite pílula quando a fonte real não possui próximos domingos', async () => {
  const htmlSemProximosDomingos = `
    <div class="card" id="secao-escala-sabado"></div>
    <div class="card" id="secao-escala-domingo">
      <h3>📱 Escala de Sobreaviso aos Domingos (Plantão TEF)</h3>
      <div class="card-tec">
        <span data-domingo="2026-10-18">📅 18/10/2026</span>
        <div title="Alisson">Alisson</div>
      </div>
    </div>
  `;

  const { context, getHorariosCache } = loadHorariosRuntime({
    now: new Date(2026, 9, 23, 10, 0, 0),
    axiosGet: async () => ({ status: 200, data: htmlSemProximosDomingos })
  });

  await context.fetchHorariosData();
  const cache = getHorariosCache();

  assert.deepEqual(cache.sobreavisoDomingos, []);
  assert.equal(cache.pillDomingos, '');
  assert.ok(!cache.tickerHtml.includes('Carol'));
  assert.ok(!cache.tickerText.includes('Carol'));
  assert.ok(!cache.tickerHtml.includes('PLANTÃO TEF'));
});

test('usa fallback de IP (192.168.243.2) quando hostname falha e preserva cache anterior se ambas as URLs falharem', async () => {
  let failAll = false;
  const calls = [];
  const { context, getHorariosCache, scheduledTimers } = loadHorariosRuntime({
    now: new Date(2026, 9, 23, 10, 0, 0),
    axiosGet: async (url) => {
      calls.push(url);
      if (failAll || url.includes('srv-ads002')) {
        throw new Error('ECONNREFUSED');
      }
      return { status: 200, data: samplePortalHtml };
    }
  });

  await context.fetchHorariosData();
  const firstCache = getHorariosCache();
  assert.equal(calls.length, 2);
  assert.match(calls[0], /srv-ads002:8888/);
  assert.match(calls[1], /192\.168\.243\.2:8888/);
  assert.ok(firstCache, 'Deve carregar pelo fallback 192.168.243.2');
  assert.equal(firstCache.sobreavisoDomingos[0].nome, 'Carol');

  // Agora simula queda total na renovação: deve preservar o cache anterior
  failAll = true;
  await context.fetchHorariosData();
  const cachedAfterFailure = getHorariosCache();
  assert.deepEqual(cachedAfterFailure, firstCache);
  assert.equal(scheduledTimers.length, 0, 'Com cache preenchido não agenda retry agressivo');
});

test('consulta fonte real de horarios somente por opt-in explicito', {
  skip: process.env.INFOBOARD_RUN_LIVE_TESTS !== 'true'
}, async (t) => {
  const { context, getHorariosCache } = loadHorariosRuntime({
    now: new Date(),
    axiosGet: (url, opts) => axios.get(url, opts)
  });

  await context.fetchHorariosData();
  const cache = getHorariosCache();
  if (!cache) {
    t.skip('Servidor srv-ads002:8888 indisponível neste ambiente');
    return;
  }

  assert.ok(Array.isArray(cache.sobreavisoDomingos));
  for (const item of cache.sobreavisoDomingos) {
    assert.ok(item.nome && item.nome.length > 0, 'Nome real do plantonista deve estar preenchido');
    assert.match(item.data, /^\d{2}\/\d{2}\/\d{4}$/, 'Data deve estar no formato DD/MM/YYYY');
    assert.match(item.dataIso, /^\d{4}-\d{2}-\d{2}$/, 'Data ISO deve estar no formato YYYY-MM-DD');
    assert.ok(cache.tickerHtml.includes(item.nome) && cache.tickerHtml.includes(item.data));
  }
});
