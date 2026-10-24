#!/usr/bin/env node
/**
 * Identifica a skill principal nos prompts dos papéis existentes do InfoBoard.
 * Não atribui papéis às sessões, não altera o canvas e não aprova popups nativos.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mappings = [
  ['Codex', '370d3005-0c36-49cf-a857-300338796695', 'Coordenação e Arquitetura', 'maestri-manager'],
  ['India', 'bd75e8f9-abd0-4e6b-90f2-7b9928d47de8', 'Implementação Técnica', 'maestri-implementar-delimitado'],
  ['India #2', '0d4131b8-5e37-4fd9-a94c-f83ea71936d1', 'Revisão e Qualidade', 'maestri-revisar-independente'],
  ['India #3', 'c434efd9-8d00-478f-a0b7-4b71657712ed', 'Pesquisa e Investigação', 'maestri-pesquisar-evidencias'],
  ['Davi', '01aef0e9-d886-44be-8ccf-aeb04c509259', 'Documentação Técnica', 'maestri-documentar-evidencias'],
  ['Davi #2', '63f614cc-307a-4b95-9064-ecd26dd73338', 'Requisitos e Escopo', 'maestri-definir-requisitos'],
  ['Davi #3', '1b50a551-e3a6-4bb2-aa9b-71316cc10941', 'Infraestrutura e Automação', 'maestri-verificar-infraestrutura'],
  ['Vigia', '1f9092af-9009-47ea-b5f4-4279efbc0192', 'Segurança e Privacidade', 'maestri-auditar-seguranca-privacidade'],
];
const check = process.argv.includes('--check');
if (process.argv.slice(2).some(a => a !== '--check')) {
  console.error('Uso: node scripts/alinha-perfis-skills-maestri.mjs [--check]');
  process.exit(2);
}

let errors = 0;
for (const [terminal, id, roleName, skill] of mappings) {
  const folder = join(root, '.maestri', 'roles', id);
  const rolePath = join(folder, 'role.json');
  const role = JSON.parse(readFileSync(rolePath, 'utf8'));
  if (role.name !== roleName || !role.prompt) {
    console.error(`CONFLITO ${terminal}: nome/prompt do papel não corresponde à matriz`);
    errors++;
    continue;
  }
  const marker = `SKILL PRINCIPAL: ${skill} (terminal ${terminal}).`;
  const source = terminal === 'Codex' ? `C:/Users/davis/.agents/skills/${skill}/SKILL.md` : `.agents/skills/${skill}/SKILL.md`;
  const directive = terminal === 'Codex'
    ? `${marker} Consulte também a skill maestri e leia ${source} para gerenciar papéis e terminais. O usuário autorizou expressamente o Maestro, em 23/10/2026, a decidir as solicitações operacionais dos agentes e suas próprias, inclusive de nível elevado dentro do projeto, conforme MAESTRI-POLITICA-OPERACIONAL.md. Use o mecanismo nativo de aprovação quando ele for exigido; não contorne recusas do sistema operacional, sandbox ou plataforma.`
    : `${marker} Antes de atuar, leia ${source} no diretório deste papel e aplique suas regras. Coordenação e autorizações seguem MAESTRI-POLITICA-OPERACIONAL.md; informe ao Codex Maestro qualquer bloqueio nativo.`;
  // A menção literal a <working_directory> no texto original de Davi #3
  // confundia a geração do AGENTS.md/CLAUDE.md e truncava o marcador do papel.
  role.prompt = role.prompt.replace('no diretório principal indicado por <working_directory>', 'no diretório principal do projeto InfoBoard');
  if (terminal === 'Codex') {
    role.prompt = role.prompt.replace('Não altere permissões ou modelos automaticamente.', 'Autorização operacional do usuário está registrada em MAESTRI-POLITICA-OPERACIONAL.md; não altere modelos sem necessidade de tarefa e não burle controles nativos de permissão.');
  }
  if (!role.prompt.includes(marker)) {
    if (check) {
      console.error(`PENDENTE ${terminal}: role.json sem destaque de skill`);
      errors++;
      continue;
    }
    role.prompt = `${directive} ${role.prompt}`;
  }
  const disk = JSON.parse(readFileSync(rolePath, 'utf8'));
  if (disk.prompt !== role.prompt) {
    if (check) {
      console.error(`PENDENTE ${terminal}: role.json não sincronizado`);
      errors++;
      continue;
    }
    writeFileSync(rolePath, `${JSON.stringify(role, null, 2)}\n`, 'utf8');
  }
  for (const basename of ['AGENTS.md', 'CLAUDE.md']) {
    const path = join(folder, basename);
    const old = readFileSync(path, 'utf8');
    const eol = old.includes('\r\n') ? '\r\n' : '\n';
    const rx = /(<your_assigned_role>\r?\n)[\s\S]*?(\r?\n<\/your_assigned_role>)/;
    let updated;
    if (rx.test(old)) {
      updated = old.replace(rx, (_, begin, end) => begin + role.prompt + end);
    } else if (old.startsWith('<your_assigned_role>') && old.trimEnd().endsWith('</working_directory>')) {
      const workdir = join(root);
      updated = `<your_assigned_role>${eol}${role.prompt}${eol}</your_assigned_role>${eol}${eol}<working_directory>${eol}IMPORTANT: You were started in this directory to receive the above role assignment. The actual project you should be working on is located at:${eol}${workdir}${eol}</working_directory>${eol}`;
    } else {
      console.error(`CONFLITO ${terminal}: ${basename} sem estrutura reconhecida`);
      errors++;
      continue;
    }
    if (old !== updated) {
      if (check) {
        console.error(`PENDENTE ${terminal}: ${basename} não sincronizado`);
        errors++;
      } else {
        writeFileSync(path, updated.replace(/(?<!\r)\n/g, eol), 'utf8');
      }
    }
  }
  console.log(`OK ${terminal} — ${roleName}: ${skill}`);
}
if (errors) process.exit(1);
console.log(`${mappings.length} perfis com skill identificada. Ativação em sessões e cabeçalho visual exigem validação no Maestri.`);
