#!/usr/bin/env node
/** Instala ou verifica três skills internas revisadas, uma por papel do InfoBoard. */
import { readFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bindings = [
  { terminal: 'India', role: 'bd75e8f9-abd0-4e6b-90f2-7b9928d47de8', skill: 'maestri-implementar-delimitado' },
  { terminal: 'India #2', role: '0d4131b8-5e37-4fd9-a94c-f83ea71936d1', skill: 'maestri-revisar-independente' },
  { terminal: 'India #3', role: 'c434efd9-8d00-478f-a0b7-4b71657712ed', skill: 'maestri-pesquisar-evidencias' },
];

const args = process.argv.slice(2);
if (args.some(arg => !['--check'].includes(arg))) {
  console.error('Uso: node scripts/instalar-skills-india.mjs [--check]');
  process.exit(2);
}
const checkOnly = args.includes('--check');
let errors = 0;
for (const { terminal, role, skill } of bindings) {
  const source = join(root, 'agent-skills', skill, 'SKILL.md');
  const destination = join(root, '.maestri', 'roles', role, '.agents', 'skills', skill, 'SKILL.md');
  if (!existsSync(source)) {
    console.error(`FALHA ${terminal}: fonte ausente para ${skill}`);
    errors++;
    continue;
  }
  const content = readFileSync(source, 'utf8');
  if (!content.startsWith(`---\nname: ${skill}\n`) || !/^description: .+/m.test(content)) {
    console.error(`FALHA ${terminal}: SKILL.md sem metadados válidos`);
    errors++;
    continue;
  }
  if (existsSync(destination)) {
    const matches = readFileSync(destination, 'utf8') === content;
    console.log(`${matches ? 'OK' : 'CONFLITO'} ${terminal}: ${skill}`);
    if (!matches) errors++;
    continue;
  }
  if (checkOnly) {
    console.error(`PENDENTE ${terminal}: ${skill}`);
    errors++;
    continue;
  }
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  console.log(`INSTALADA ${terminal}: ${skill}`);
}
if (errors) process.exit(1);
console.log('3 skills verificadas. Confirme separadamente as atribuições de papel e o uso em cada terminal.');
