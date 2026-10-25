const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

// Entrada tecnica mantida para instalacoes antigas. Nunca remover um servico
// apenas por nome: outra instalacao pode usar o mesmo nome global do Windows.
const command = String.raw`
$ErrorActionPreference='Stop'
try {
  $root=[IO.Path]::GetFullPath($env:IB_SERVICE_ROOT).TrimEnd('\')
  $walk=$root
  while($walk){
    if((Get-Item -LiteralPath $walk -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Link rejeitado'}
    $walk=[IO.Path]::GetDirectoryName($walk)
  }
  $services=@(Get-CimInstance Win32_Service -Filter "Name like '%infoboard%' OR DisplayName = 'Infoboard TV'")
  $count=0
  foreach($s in $services){
    if($s.PathName -notmatch '^(?:"([^"]+)"|(\S+))'){continue}
    $exe=if($Matches[1]){$Matches[1]}else{$Matches[2]}
    if(-not [IO.Path]::IsPathRooted($exe) -or -not [IO.Path]::GetFullPath($exe).StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){continue}
    $service=Get-Service -Name $s.Name
    if($service.Status -ne 'Stopped'){
      Stop-Service -Name $s.Name -ErrorAction Stop
      $service.WaitForStatus('Stopped',[TimeSpan]::FromSeconds(45))
    }
    & (Join-Path $env:SystemRoot 'System32/sc.exe') delete $s.Name | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Remocao de servico falhou'}
    Write-Output ('[OK] Remocao solicitada ao SCM: '+$s.Name)
    $count++
  }
  if($count -eq 0){Write-Output '[OK] Nenhum servico vinculado a esta pasta; nenhum outro servico foi alterado.'}
  exit 0
} catch {
  [Console]::Error.WriteLine('[ERRO SERVICO] Remocao nao confirmada. Confira services.msc, caminho e permissoes. Tipo: '+$_.Exception.GetType().Name)
  exit 1
}
`;

function uninstallServices(root, execute = execFileSync) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.name !== 'infoboard' || !fs.existsSync(path.join(root, 'server.js'))) throw new Error('Pasta Infoboard invalida.');
  const env = { ...process.env, IB_SERVICE_ROOT: path.resolve(root) };
  for (const key of Object.keys(env)) if (/^PSModulePath$/i.test(key)) delete env[key];
  return execute('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', command], {
    env, encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe']
  });
}
if (require.main === module) {
  try { process.stdout.write(uninstallServices(path.resolve(__dirname, '..'))); }
  catch { console.error('[ERRO SERVICO] Desinstalacao interrompida. Confira a pasta, services.msc e permissoes administrativas.'); process.exitCode = 1; }
}
module.exports = { uninstallServices };
