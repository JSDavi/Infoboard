[CmdletBinding()]
param([switch]$Apply, [switch]$InstructionsOnly)

$ErrorActionPreference = 'Stop'
$taskCodexConfig = 'C:\Users\davis\.codex\config.toml'
$taskAntigravityConfig = 'C:\Users\davis\.gemini\antigravity-cli\settings.json'
$taskInstructionFiles = @(
    'C:\Users\davis\.codex\AGENTS.md',
    'C:\Users\davis\.gemini\GEMINI.md'
)
$taskUtf8 = [System.Text.UTF8Encoding]::new($false)
$taskTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'

$taskInstructionBlock = @'
<!-- BEGIN GLOBAL AUTONOMY AND GIT POLICY -->
## Autonomia e Git — todos os projetos

- Execute o trabalho autorizado pelo usuário sem repetir confirmações operacionais já concedidas. Configurações globais de ferramentas não autorizam novas tarefas nem ampliam o escopo por si mesmas.
- Quando trabalhar sob coordenação no Maestri, respeite a delegação e o papel atribuído. Encaminhe ao coordenador dúvidas de escopo e solicitações operacionais; ele pode aprovar o que já estiver coberto pelo pedido do usuário, sem repetir a confirmação humana.
- Nunca execute git push, publique commits por API ou faça operação equivalente por iniciativa própria. Só envie commits ao remoto quando houver pedido explícito do usuário para essa entrega, como "suba para o git" ou "faça o push". Autorização para programar, testar, fazer commit ou configurar permissões não autoriza push.
- Uma delegação só autoriza push quando o coordenador informar o pedido explícito do usuário e delimitar repositório e entrega. Os demais agentes devem entregar alterações e evidências ao coordenador sem fazer push.
- Quando push estiver autorizado, confira o status, o diff, a branch e o remoto. Preserve alterações alheias, faça apenas os commits pertinentes e não use force push nem publique segredos sem autorização específica.
- Respeite instruções do projeto e controles obrigatórios do Windows, sandbox e plataforma. Registre recusas explícitas; não contorne bloqueios. A configuração global não autoriza divulgar credenciais nem alterar produção ou contas externas fora do pedido do usuário.
<!-- END GLOBAL AUTONOMY AND GIT POLICY -->
'@

function Set-TaskRootTomlValue {
    param([string]$Text, [string]$Key, [string]$Value)
    $taskFirstSection = [regex]::Match($Text, '(?m)^\s*\[')
    $taskBoundary = if ($taskFirstSection.Success) { $taskFirstSection.Index } else { $Text.Length }
    $taskRoot = $Text.Substring(0, $taskBoundary)
    $taskRest = $Text.Substring($taskBoundary)
    $taskRegex = [regex]::new('(?m)^' + [regex]::Escape($Key) + '[ \t]*=[^\r\n]*')
    $taskLine = $Key + ' = "' + $Value + '"'
    if ($taskRegex.IsMatch($taskRoot)) {
        $taskRoot = $taskRegex.Replace($taskRoot, $taskLine)
    } else {
        $taskRoot = $taskLine + "`r`n" + $taskRoot
    }
    return $taskRoot + $taskRest
}

$taskCodexBefore = [IO.File]::ReadAllText($taskCodexConfig)
$taskCodexAfter = Set-TaskRootTomlValue $taskCodexBefore 'approval_policy' 'never'
$taskCodexAfter = Set-TaskRootTomlValue $taskCodexAfter 'sandbox_mode' 'danger-full-access'
$taskAgyBefore = [IO.File]::ReadAllText($taskAntigravityConfig)
$taskAgySettings = $taskAgyBefore | ConvertFrom-Json
$taskAgySettings | Add-Member -NotePropertyName agentMode -NotePropertyValue 'accept-edits' -Force
$taskAgySettings | Add-Member -NotePropertyName toolPermission -NotePropertyValue 'always-proceed' -Force
$taskAgySettings | Add-Member -NotePropertyName artifactReviewPolicy -NotePropertyValue 'always-proceed' -Force
$taskAgyAfter = ($taskAgySettings | ConvertTo-Json -Depth 100) + "`r`n"

$taskChanges = @(if (-not $InstructionsOnly) {
    [PSCustomObject]@{ Path = $taskCodexConfig; Before = $taskCodexBefore; After = $taskCodexAfter; Exists = $true },
    [PSCustomObject]@{ Path = $taskAntigravityConfig; Before = $taskAgyBefore; After = $taskAgyAfter; Exists = $true }
})
foreach ($taskInstructionPath in $taskInstructionFiles) {
    $taskExists = Test-Path -LiteralPath $taskInstructionPath
    $taskBefore = if ($taskExists) { [IO.File]::ReadAllText($taskInstructionPath) } else { '' }
    $taskPattern = '(?s)<!-- BEGIN GLOBAL AUTONOMY AND GIT POLICY -->.*?<!-- END GLOBAL AUTONOMY AND GIT POLICY -->'
    $taskAfter = if ([regex]::IsMatch($taskBefore, $taskPattern)) {
        [regex]::Replace($taskBefore, $taskPattern, $taskInstructionBlock)
    } else {
        $taskBefore.TrimEnd() + $(if ($taskBefore.Trim().Length -gt 0) { "`r`n`r`n" } else { '' }) + $taskInstructionBlock + "`r`n"
    }
    $taskChanges += [PSCustomObject]@{ Path = $taskInstructionPath; Before = $taskBefore; After = $taskAfter; Exists = $taskExists }
}

if (-not $Apply) {
    Write-Output 'PREVIEW ONLY: no files changed.'
    if (-not $InstructionsOnly) {
        Write-Output 'Codex: approval_policy=never; sandbox_mode=danger-full-access'
        Write-Output 'Antigravity: agentMode=accept-edits; toolPermission=always-proceed; artifactReviewPolicy=always-proceed'
    }
    foreach ($taskChange in $taskChanges) {
        [PSCustomObject]@{ Path = $taskChange.Path; Existing = $taskChange.Exists; Changed = $taskChange.Before -cne $taskChange.After }
    }
    Write-Output $taskInstructionBlock
    exit 0
}

# Check for concurrent edits before writing any file; each existing file gets an adjacent backup.
foreach ($taskChange in $taskChanges) {
    $taskNowExists = Test-Path -LiteralPath $taskChange.Path
    if ($taskNowExists -ne $taskChange.Exists) { throw "Concurrent change: $($taskChange.Path)" }
    if ($taskNowExists -and [IO.File]::ReadAllText($taskChange.Path) -cne $taskChange.Before) {
        throw "Concurrent change: $($taskChange.Path)"
    }
}
$taskApplied = @()
try {
    foreach ($taskChange in $taskChanges) {
        if ($taskChange.Before -ceq $taskChange.After) { continue }
        if ($taskChange.Exists) {
            $taskBackup = $taskChange.Path + '.backup-' + $taskTimestamp
            Copy-Item -LiteralPath $taskChange.Path -Destination $taskBackup
            Write-Output ('BACKUP: ' + $taskBackup)
        }
        $taskApplied += $taskChange
        [IO.File]::WriteAllText($taskChange.Path, $taskChange.After, $taskUtf8)
        if ([IO.File]::ReadAllText($taskChange.Path) -cne $taskChange.After) { throw "Read-back mismatch: $($taskChange.Path)" }
        Write-Output ('UPDATED: ' + $taskChange.Path)
    }
    if ($InstructionsOnly) {
        Write-Output 'VERIFIED: Global instruction files passed read-back checks. Permission settings were not changed.'
    } else {
    $taskParsedAgy = [IO.File]::ReadAllText($taskAntigravityConfig) | ConvertFrom-Json
    if ($taskParsedAgy.toolPermission -ne 'always-proceed' -or $taskParsedAgy.agentMode -ne 'accept-edits' -or $taskParsedAgy.artifactReviewPolicy -ne 'always-proceed') {
        throw 'Antigravity settings verification failed.'
    }
    # A parser-only Codex command validates the saved TOML without starting an agent or contacting a model.
    $taskCodexExe = (Get-Command codex -ErrorAction Stop).Source
    $taskCodexValidation = & $taskCodexExe features list 2>&1
    if ($LASTEXITCODE -ne 0) { throw ('Codex configuration validation failed: ' + ($taskCodexValidation -join "`n")) }
    Write-Output 'VERIFIED: Codex parsed its global configuration; Antigravity JSON and all written files passed read-back checks.'
    }
} catch {
    foreach ($taskChange in $taskApplied) {
        if ($taskChange.Exists) {
            $taskBackup = $taskChange.Path + '.backup-' + $taskTimestamp
            Copy-Item -LiteralPath $taskBackup -Destination $taskChange.Path -Force
        } else {
            Remove-Item -LiteralPath $taskChange.Path
        }
    }
    throw
}
