#!/usr/bin/env node
/** Copia e confere skills internas revisadas para os três papéis Davi. */
import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bindings = [
  { terminal: 'Davi', role: '01aef0e9-d886-44be-8ccf-aeb04c509259', skill: 'maestri-documentar-evidencias' },
  { terminal: 'Davi #2', role: '63f614cc-307a-4b95-9064-ecd26dd73338', skill: 'maestri-definir-requisitos' },
  { terminal: 'Davi #3', role: '1b50a551-e3a6-4bb2-aa9b-71316cc10941', skill: 'maestri-verificar-infraestrutura' },
];

const args = process.argv.slice(2);
if (args.some(x => x !== '--check')) {
  console.error('Uso: node scripts/instalar-skills-davi.mjs [--check]');
  process.exit(2);
}
const check = args.includes('--check');
let failures = 0;
for (const { terminal, role, skill } of bindings) {
  const source = join(root, 'agent-skills', skill, 'SKILL.md');
  const target = join(root, '.maestri', 'roles', role, '.agents', 'skills', skill, 'SKILL.md');
  if (!existsSync(source)) {
    console.error(`FALHA ${terminal}: origem ausente`);
    failures++;
    continue;
  }
  const data = readFileSync(source, 'utf8');
  if (!data.startsWith(`---\nname: ${skill}\n`) || !/^description: .+/m.test(data)) {
    console.error(`FALHA ${terminal}: SKILL.md inválida`);
    failures++;
    continue;
  }
  if (existsSync(target)) {
    const identical = readFileSync(target, 'utf8') === data;
    console.log(`${identical ? 'OK' : 'CONFLITO'} ${terminal}: ${skill}`);
    if (!identical) failures++;
  } else if (check) {
    console.error(`PENDENTE ${terminal}: ${skill}`);
    failures++;
  } else {
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    console.log(`INSTALADA ${terminal}: ${skill}`);
  }
}
if (failures) process.exit(1);
console.log('3 skills conferidas; vínculo dos terminais e uso ao vivo exigem validação separada.');
