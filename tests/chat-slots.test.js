const test = require('node:test');
const assert = require('node:assert/strict');
const { parseStoredObject, normalizeGroups, getVisibleLayout, applyDropToGroups } = require('../public/chat-slots');

const agents = ['Germano', 'Lili', 'Davi', 'Igor'].map(name => ({ name, tickets: [{}] }));

test('terceiro grupo fixado continua visível com Pendentes, sem entrar no carrossel', () => {
  const saved = { 0: ['Germano'], 1: ['Lili'], 2: ['Davi'] };
  const layout = getVisibleLayout(saved, agents, true);
  assert.deepEqual(layout.slots, [['Germano'], ['Lili', 'Davi']]);
  assert.deepEqual(layout.rotatingAgents.map(agent => agent.name), ['Igor']);
  assert.deepEqual(layout.freeSlots, []);
  assert.deepEqual(saved[2], ['Davi']);
});

test('quando Pendentes desaparece, os três grupos voltam às colunas originais', () => {
  const saved = { 0: ['Germano'], 1: ['Lili'], 2: ['Davi'] };
  const layout = getVisibleLayout(saved, agents, false);
  assert.deepEqual(layout.slots, [['Germano'], ['Lili'], ['Davi']]);
  assert.deepEqual(layout.rotatingAgents.map(agent => agent.name), ['Igor']);
});

test('fixação em terceiro slot usa segundo visível quando Pendentes está aberto', () => {
  const layout = getVisibleLayout({ 0: [], 1: [], 2: ['Davi'] }, agents, true);
  assert.deepEqual(layout.slots, [[], ['Davi']]);
  assert.deepEqual(layout.freeSlots, [0]);
  assert.deepEqual(layout.rotatingAgents.map(agent => agent.name), ['Germano', 'Lili', 'Igor']);
});

test('preferências quebradas ou grupos duplicados são tratados sem interromper o painel', () => {
  assert.deepEqual(parseStoredObject('{json inválido}', {}), {});
  assert.deepEqual(parseStoredObject('[]', {}), {});
  assert.deepEqual(normalizeGroups({ 0: ['Davi', 'Davi', 123], 1: 'erro', 2: ['Davi', 'Lili'] }), {
    0: ['Davi'], 1: [], 2: ['Lili']
  });
});

test('arrastar no slot visual temporário sem alvo preserva o grupo original 2', () => {
  const saved = { 0: ['Germano'], 1: ['Lili'], 2: ['Davi'] };
  const updated = applyDropToGroups(saved, 'Davi', 1, undefined, true);
  assert.deepEqual(updated, saved);
  assert.notStrictEqual(updated, saved);
});

test('arrastar sobre um alvo fixado no grupo 2 respeita a origem do alvo', () => {
  const saved = { 0: ['Germano'], 1: ['Lili'], 2: ['Davi'] };
  assert.deepEqual(applyDropToGroups(saved, 'Igor', 1, 'Davi', true), {
    0: ['Germano'], 1: ['Lili'], 2: ['Davi', 'Igor']
  });
});

test('arrastar sobre um alvo fixado no grupo 1 move para o grupo 1', () => {
  const saved = { 0: ['Germano'], 1: ['Lili'], 2: ['Davi'] };
  assert.deepEqual(applyDropToGroups(saved, 'Davi', 1, 'Lili', true), {
    0: ['Germano'], 1: ['Lili', 'Davi'], 2: []
  });
});

test('arrastar analista rotativo para slot vazio o fixa no destino', () => {
  const saved = { 0: ['Germano'], 1: [], 2: ['Davi'] };
  assert.deepEqual(applyDropToGroups(saved, 'Igor', 1, undefined, false), {
    0: ['Germano'], 1: ['Igor'], 2: ['Davi']
  });
});

test('arrastar entre grupos mantém o alvo e não duplica membros', () => {
  const saved = { 0: ['Germano', 'Igor'], 1: ['Lili'], 2: ['Davi'] };
  assert.deepEqual(applyDropToGroups(saved, 'Igor', 2, 'Davi', false), {
    0: ['Germano'], 1: ['Lili'], 2: ['Davi', 'Igor']
  });
});

test('arrastar um analista sobre si mesmo não altera grupos', () => {
  const saved = { 0: ['Germano'], 1: ['Lili'], 2: ['Davi'] };
  assert.deepEqual(applyDropToGroups(saved, 'Davi', 2, 'Davi', false), saved);
});

test('arrastar sobre alvo rotativo cria agrupamento sem perder o alvo', () => {
  const saved = { 0: ['Germano'], 1: [], 2: ['Davi'] };
  assert.deepEqual(applyDropToGroups(saved, 'Igor', 1, 'Lili', false), {
    0: ['Germano'], 1: ['Lili', 'Igor'], 2: ['Davi']
  });
});

test('soltar em posição inexistente não altera grupos', () => {
  const saved = { 0: ['Germano'], 1: ['Lili'], 2: ['Davi'] };
  assert.deepEqual(applyDropToGroups(saved, 'Davi', 2, undefined, true), saved);
  assert.deepEqual(applyDropToGroups(saved, '', 1, undefined, true), saved);
});

test('alterar grupo com Pendentes conserva posições originais ao desaparecer', () => {
  const saved = { 0: ['Germano'], 1: ['Lili'], 2: ['Davi'] };
  const updated = applyDropToGroups(saved, 'Igor', 1, 'Davi', true);
  assert.deepEqual(getVisibleLayout(updated, agents, true).slots, [['Germano'], ['Lili', 'Davi', 'Igor']]);
  assert.deepEqual(getVisibleLayout(updated, agents, false).slots, [['Germano'], ['Lili'], ['Davi', 'Igor']]);
});
