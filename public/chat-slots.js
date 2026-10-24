// Regras de fixação do PrixChat compartilhadas entre o painel e os testes.
(function (root) {
  'use strict';

  function parseStoredObject(raw, fallback = {}) {
    try {
      const value = JSON.parse(raw || 'null');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function normalizeGroups(savedGroups) {
    const groups = { 0: [], 1: [], 2: [] };
    const used = new Set();
    for (let slot = 0; slot < 3; slot++) {
      const members = savedGroups && savedGroups[slot];
      if (!Array.isArray(members)) continue;
      for (const name of members) {
        if (typeof name === 'string' && name.length > 0 && !used.has(name)) {
          groups[slot].push(name);
          used.add(name);
        }
      }
    }
    return groups;
  }

  function getVisibleLayout(savedGroups, busyAgents, showPending) {
    const groups = normalizeGroups(savedGroups);
    const slots = Array.from({ length: showPending ? 2 : 3 }, () => []);
    const activeNames = new Set(busyAgents.map(agent => agent.name));

    for (let originalSlot = 0; originalSlot < 3; originalSlot++) {
      // Pendentes ocupa a terceira coluna: o grupo fixado no slot 2
      // aparece temporariamente no slot 1, sem alterar sua configuração salva.
      const visibleSlot = showPending && originalSlot === 2 ? 1 : originalSlot;
      for (const name of groups[originalSlot]) {
        if (activeNames.has(name)) slots[visibleSlot].push(name);
      }
    }

    const pinnedNames = new Set(slots.flat());
    return {
      slots,
      rotatingAgents: busyAgents.filter(agent => !pinnedNames.has(agent.name)),
      freeSlots: slots.flatMap((members, index) => members.length === 0 ? [index] : [])
    };
  }

  // A posição 2 só é exibida junto à posição 1 enquanto Pendentes está visível.
  // Um arraste na posição temporária não deve alterar o agrupamento salvo sem intenção.
  function applyDropToGroups(savedGroups, draggedName, visibleSlot, targetName, showPending) {
    const groups = normalizeGroups(savedGroups);
    const limit = showPending ? 2 : 3;
    if (typeof draggedName !== 'string' || !draggedName ||
        !Number.isInteger(visibleSlot) || visibleSlot < 0 || visibleSlot >= limit ||
        draggedName === targetName) return groups;

    const findSlot = name => {
      for (let slot = 0; slot < 3; slot++) {
        if (groups[slot].includes(name)) return slot;
      }
      return -1;
    };
    const sourceSlot = findSlot(draggedName);
    const targetSlot = targetName ? findSlot(targetName) : -1;

    let destination = visibleSlot;
    if (targetSlot !== -1) {
      // Soltar em cima de um analista agrupa na coluna original dele.
      destination = targetSlot;
    } else if (showPending && visibleSlot === 1) {
      // Sem alvo definido, mantém o grupo de origem se ele já ocupa esta posição.
      if (sourceSlot === 1 || sourceSlot === 2) destination = sourceSlot;
      else destination = groups[1].length > 0 ? 1 : groups[2].length > 0 ? 2 : 1;
    }

    // Um alvo rotativo precisa ser fixado mesmo quando a origem já está no slot.
    if (sourceSlot === destination && (!targetName || targetSlot === destination)) return groups;

    for (let slot = 0; slot < 3; slot++) {
      groups[slot] = groups[slot].filter(name => name !== draggedName);
    }
    if (targetName && targetSlot === -1) groups[destination].push(targetName);
    groups[destination].push(draggedName);
    return groups;
  }

  const api = { parseStoredObject, normalizeGroups, getVisibleLayout, applyDropToGroups };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.InfoBoardChatSlots = api;
})(typeof window !== 'undefined' ? window : globalThis);
