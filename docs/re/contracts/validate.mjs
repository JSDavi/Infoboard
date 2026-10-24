/** [INFERIDO] Verificador offline de evidência e artefatos; não faz chamadas HTTP.
 * Implementa somente os construtos de schema usados nesta reconstrução.
 * Não substitui um validador completo de OpenAPI nem testes contra servidor.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const evidence = json('evidence.json');
const raw = json('raw/postman-collection.json');
const manifest = json('raw/manifest.json');
const api = json('openapi.yaml'); // JSON é um subconjunto de YAML 1.2.
const collection = json('contracts/beatrix.postman_collection.json');
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
}

function uncomment(text) {
  let out = '', inString = false, escaped = false, comment = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (comment) {
      if (ch === '\n') { comment = false; out += ch; }
      continue;
    }
    if (!inString && ch === '/' && text[i + 1] === '/') {
      comment = true; i++; continue;
    }
    out += ch;
    if (ch === '"' && !escaped) inString = !inString;
    escaped = inString && ch === '\\' && !escaped;
  }
  return out;
}

function parseBody(text) {
  return text?.trim() ? JSON.parse(uncomment(text)) : undefined;
}

function resolve(ref) {
  return ref.split('/').slice(1).reduce((value, key) => value?.[key], api);
}

function validates(schema, value) {
  if (schema.$ref) return validates(resolve(schema.$ref), value);
  if (schema.anyOf) return schema.anyOf.some(s => validates(s, value));
  if (!schema.type) return true;
  if (schema.type === 'array') return Array.isArray(value) && value.every(v => validates(schema.items, v));
  if (schema.type === 'object') {
    if (value === null || Array.isArray(value) || typeof value !== 'object') return false;
    if ((schema.required || []).some(k => !(k in value))) return false;
    return Object.entries(schema.properties || {}).every(([key, sub]) => !(key in value) || validates(sub, value[key]));
  }
  return typeof value === schema.type;
}

function walk(value, visit) {
  if (value && typeof value === 'object') {
    visit(value);
    for (const child of Object.values(value)) walk(child, visit);
  }
}

check('26 itens documentais indexados', evidence.entries.length === 26);
check('24 operações completas', evidence.entries.filter(e => e.complete).length === 24);
check('15 exemplos, 2 com HTTP explícito', evidence.entries.reduce((n, e) => n + e.responses.length, 0) === 15
  && evidence.entries.flatMap(e => e.responses).filter(r => r.httpStatus !== null).length === 2);
check('OpenAPI 3.1.0 identificado', api.openapi === '3.1.0');
check('Hash da captura preservado', crypto.createHash('sha256').update(read('raw/postman-collection.json')).digest('hex') === evidence.rawSha256);
for (const file of manifest.files) {
  check('Integridade raw: ' + file.name, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'raw', file.name))).digest('hex') === file.sha256);
}

let sourceFields = 0, responseFixtures = 0;
for (const e of evidence.entries) {
  const original = e.pointer.split('/').slice(1).reduce((value, key) => value[key], raw);
  check(e.id + ' ponteiro e método preservados', original.request.method === e.method && original.name === e.name);
  if (!e.complete) {
    check(e.id + ' incompleto excluído dos paths', api['x-incomplete-items'].some(x => x.id === e.id)
      && !Object.values(api.paths).some(x => Object.values(x).some(op => op.operationId === e.id)));
    continue;
  }
  const operation = api.paths[e.path]?.[e.method.toLowerCase()];
  check(e.id + ' operação com origem e classificação', operation?.operationId === e.id
    && operation['x-source-pointer'] === e.pointer && operation['x-sensitive'] === e.sensitive);
  const fields = [...e.path.matchAll(/\{([^}]+)\}/g)].map(m => m[1]);
  check(e.id + ' parâmetros de caminho declarados', fields.every(name => operation.parameters.some(p => p.name === name && p.in === 'path' && p.required)));
  check(e.id + ' ao menos uma resposta', Object.keys(operation.responses).length > 0);
  if (e.requestSchema) {
    const body = parseBody(original.request.body.raw);
    check(e.id + ' request original e saneado compatíveis com schema', validates(e.requestSchema, body) && validates(e.requestSchema, e.requestExample));
    sourceFields += Object.keys(body).length;
  }
  for (const response of e.responses) {
    const source = original.response[response.index];
    check(e.id + '/' + response.index + ' HTTP não inventado', (source.code ?? null) === response.httpStatus
      && (response.httpStatus !== null || 'default' in operation.responses));
    if (response.schema) {
      responseFixtures++;
      check(e.id + '/' + response.index + ' resposta original e saneada compatíveis', validates(response.schema, parseBody(source.body))
        && validates(response.schema, response.example));
    }
  }
}

let brokenRefs = 0;
walk(api, value => { if (value.$ref && !resolve(value.$ref)) brokenRefs++; });
check('Todas as referências internas resolvidas', brokenRefs === 0);
check('Somente rotas documentadas completas em paths', Object.values(api.paths).reduce((n, p) => n + Object.keys(p).length, 0) === 24);
check('Token modelado como apiKey de header', api.components.securitySchemes.AccessToken.type === 'apiKey'
  && api.components.securitySchemes.AccessToken.in === 'header' && api.components.securitySchemes.AccessToken.name === 'Access-token');
check('Obrigatórios E12 preservados', JSON.stringify(api.components.schemas.E12Request.required)
  === JSON.stringify(['report_type', 'queues', 'date_started_at', 'time_started_at', 'date_ended_at', 'time_ended_at']));
check('24 testes locais, sem requests de rota incompleta', collection.item.length === 24);
check('Mock desabilitado por padrão', collection.variable.find(x => x.key === 'mock_confirmed')?.value === 'false');

const guard = collection.event.find(e => e.listen === 'prerequest').script.exec.join('\n');
function accepted(url, confirmed) {
  try {
    vm.runInNewContext(guard, { pm: { request: { url: { toString: () => url } }, variables: { replaceIn: () => url }, collectionVariables: { get: () => confirmed } } }, { timeout: 1000 });
    return true;
  } catch { return false; }
}
check('Guard aceita apenas mock confirmado', accepted('http://127.0.0.1:4010/api/test', 'true')
  && accepted('http://localhost:4010/api/test', 'true') && !accepted('http://localhost:4010/api/test', 'false'));
check('Guard bloqueia host operacional e destinos externos', !accepted('https://app.npxtech.com.br/api/pabx', 'true')
  && !accepted('http://localhost:4010@external.invalid/api/test', 'true')
  && !accepted('https://external.invalid/api/test', 'true'));
for (const item of collection.item) {
  check(item.name.split(' ')[0] + ' teste sem URL operacional', item.request.url.startsWith('{{mock_base_url}}/api/'));
  if (item.request.body) check(item.name.split(' ')[0] + ' body Postman é JSON válido', Boolean(JSON.parse(item.request.body.raw)));
}

// Compara valores pessoais/credenciais do original com arquivos derivados.
// Os valores nunca são registrados, inclusive em falhas.
const privateValues = new Set();
const privateKey = /^(agent_name|client_name|client_extra_info|cpf_cnpj|src|dst|number|callerid|ddr|secret|password|call_motive|call_obs|cost_center_name)$/i;
function collect(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (privateKey.test(key) && typeof child === 'string' && child.length >= 3 && !/^x+$/i.test(child)) privateValues.add(child);
    if (child && typeof child === 'object') collect(child);
  }
}
for (const folder of raw.item) for (const item of folder.item) {
  collect(parseBody(item.request.body?.raw));
  for (const response of item.response || []) {
    collect(parseBody(response.body));
    for (const header of response.header || []) if (/set-cookie/i.test(header.key)) privateValues.add(header.value);
  }
}
const derivedFiles = fs.readdirSync(root).filter(name => /\.(md|json|yaml)$/.test(name))
  .concat(['types/beatrix.ts', 'contracts/beatrix.postman_collection.json']);
for (const relative of derivedFiles) {
  const text = read(relative);
  check('Sem valores pessoais/credenciais originais: ' + relative, ![...privateValues].some(value => text.includes(value)));
}

const report = {
  certainty: 'DOCUMENTADO',
  mode: 'offline; nenhuma chamada de rede',
  result: checks.every(x => x.pass) ? 'pass' : 'fail',
  checks: checks.length,
  passed: checks.filter(x => x.pass).length,
  failed: checks.filter(x => !x.pass),
  sourceRequestFieldsChecked: sourceFields,
  responseFixturesChecked: responseFixtures,
  limitations: ['Verificação estrutural própria; não executa validador OpenAPI completo.',
    'Esquemas permissivos derivados de exemplos; não garantem contrato exaustivo.',
    'Collection Postman não executada contra mock ou Beatrix.',
    'Não confirma transições, autorização, disponibilidade ou comportamento do servidor.'],
};
fs.writeFileSync(path.join(root, 'contracts/validation-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.result === 'pass' ? 0 : 1;
