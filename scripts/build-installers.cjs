const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function buildUpdater(nodeSource = '') {
  const core = fs.readFileSync(path.join(root, 'instalador/updater-core.ps1'), 'utf8');
  // O grupo CMD e o payload inteiro sao lidos antes da copia de arquivos. Nao ha
  // leitura posterior do BAT original, que pode ser atualizado pelo proprio fluxo.
  const launcher = `@echo off
setlocal DisableDelayedExpansion
set "ERRORLEVEL="
title InfoBoard - Atualizador
set "IB_UPDATER_SELF=%~f0"
(
powershell.exe -NoLogo -NoProfile -Command "$text=[IO.File]::ReadAllText($env:IB_UPDATER_SELF); $start=$text.IndexOf([Environment]::NewLine+'# INFOBOARD_PAYLOAD_BEGIN'); $end=$text.LastIndexOf([Environment]::NewLine+'# INFOBOARD_PAYLOAD_END'); if($start -lt 0 -or $end -le $start){Write-Host 'FALHA: arquivo incompleto.'; exit 1}; $code=$text.Substring($start,$end-$start); . ([scriptblock]::Create($code)); exit (Start-IBUpdater $env:IB_UPDATER_SELF)"
call exit /b %%errorlevel%%
)
# INFOBOARD_PAYLOAD_BEGIN
`;
  const pbx = fs.readFileSync(path.join(root, 'instalador/pbx-config.ps1'), 'utf8');
  return (launcher + nodeSource + '\n' + pbx + '\n' + core + '\n# INFOBOARD_PAYLOAD_END\n').replace(/\r?\n/g, '\r\n');
}
function build() {
  const helper = path.join(root, 'instalador/ensure-node.ps1');
  if (!fs.existsSync(helper)) throw new Error('Falta ensure-node.ps1; geracao interrompida.');
  const nodeSource = fs.readFileSync(helper, 'utf8');
  fs.writeFileSync(path.join(root, 'instalador/ATUALIZAR_INFOBOARD.bat'), buildUpdater(nodeSource));
}
if (require.main === module) build();
module.exports = { buildUpdater, build };
