<#
.SYNOPSIS
    Garante permissões restritas (ACL) para arquivos sensíveis (.env e backups de credenciais).
.DESCRIPTION
    Remove herança de permissões e concede FullControl EXCLUSIVAMENTE a:
      - Usuário Atual (Current User)
      - SISTEMA Local (NT AUTHORITY\SYSTEM / S-1-5-18 - necessário para o Windows Service)
    Qualquer outro usuário ou grupo (Administrators, BUILTIN\Users, Everyone, etc.) perde acesso.
    Rejeita caminhos que apontam para reparse points (symlinks, junctions).
    Garante que o destino seja protegido ANTES da escrita de segredos.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Path,

    [Parameter(Mandatory = $false)]
    [string]$SourcePath
)

$ErrorActionPreference = 'Stop'

function Assert-NoReparsePoint([string]$targetPath) {
    $probe = [System.IO.Path]::GetFullPath($targetPath)
    while ($probe) {
        if (Test-Path -LiteralPath $probe) {
            $attr = [System.IO.File]::GetAttributes($probe)
            if ($attr -band [System.IO.FileAttributes]::ReparsePoint) {
                throw 'Caminho sensivel ou ancestral e um reparse point.'
            }
        }
        $parent = [System.IO.Path]::GetDirectoryName($probe)
        if ($parent -eq $probe) { break }
        $probe = $parent
    }
}

try {
    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "O caminho do arquivo de destino nao pode ser vazio."
    }

    # Se SourcePath foi fornecido, validar sua existencia e integridade ANTES de qualquer alteracao no destino
    $resolvedSource = $null
    if (-not [string]::IsNullOrEmpty($SourcePath)) {
        if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
            throw "Arquivo de origem nao encontrado antes de proteger o destino: $SourcePath"
        }
        $resolvedSource = [System.IO.Path]::GetFullPath($SourcePath)
        Assert-NoReparsePoint $resolvedSource
    }

    $resolvedPath = [System.IO.Path]::GetFullPath($Path)

    # Rejeitar destino se for reparse point existente
    Assert-NoReparsePoint $resolvedPath

    $parentDir = [System.IO.Path]::GetDirectoryName($resolvedPath)
    if (-not [string]::IsNullOrEmpty($parentDir)) {
        if (-not (Test-Path -LiteralPath $parentDir)) {
            [System.IO.Directory]::CreateDirectory($parentDir) | Out-Null
        }
    }

    # Se o arquivo nao existir, cria vazio antes de definir ACL para proteger o destino
    # ANTES que qualquer segredo seja gravado nele.
    if (-not (Test-Path -LiteralPath $resolvedPath)) {
        [System.IO.File]::WriteAllBytes($resolvedPath, @())
    }

    # Obtem identidades e SIDs exatos necessarios
    $currentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $userSid = $currentIdentity.User
    $systemSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')

    # Obtem a ACL atual
    $acl = Get-Acl -LiteralPath $resolvedPath

    # 1. Desativa a heranca de permissoes da pasta pai e remove as regras herdadas ($true, $false)
    $acl.SetAccessRuleProtection($true, $false)

    # 2. Remove quaisquer regras de acesso explicitas remanescentes
    $existingRules = @($acl.Access)
    foreach ($rule in $existingRules) {
        $acl.RemoveAccessRuleSpecific($rule) | Out-Null
    }

    # 3. Adiciona permissao FullControl SOMENTE para o Usuario Atual e para o SYSTEM
    $ruleUser = New-Object System.Security.AccessControl.FileSystemAccessRule($userSid, 'FullControl', 'Allow')
    $acl.AddAccessRule($ruleUser)

    $ruleSystem = New-Object System.Security.AccessControl.FileSystemAccessRule($systemSid, 'FullControl', 'Allow')
    $acl.AddAccessRule($ruleSystem)

    # 4. Aplica a nova ACL ao arquivo (sem tentativas alternativas caso haja recusa do SO)
    Set-Acl -LiteralPath $resolvedPath -AclObject $acl

    # 5. Validacao estrita da ACL pos-aplicacao (lista exata de SIDs Allow e direitos FullControl)
    $verifyAcl = Get-Acl -LiteralPath $resolvedPath
    if (-not $verifyAcl.AreAccessRulesProtected) {
        throw "Falha ao desativar a heranca de permissoes em: $resolvedPath"
    }

    $accessRules = @($verifyAcl.Access)
    if ($accessRules.Count -ne 2) {
        throw "Quantidade inesperada de regras na ACL de '$resolvedPath': $($accessRules.Count) (esperado exatamente 2: Usuario Atual e SYSTEM)"
    }

    $expectedSids = @($userSid.Value, $systemSid.Value)
    foreach ($rule in $accessRules) {
        if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
            throw "Regra com tipo nao permitido na ACL de '$resolvedPath': $($rule.AccessControlType)"
        }
        if ($rule.IsInherited) {
            throw "Regra herdada detectada na ACL protegida de '$resolvedPath'"
        }
        # Converter identity para SID
        $id = $rule.IdentityReference
        $sidVal = if ($id -is [System.Security.Principal.SecurityIdentifier]) { $id.Value } else { $id.Translate([System.Security.Principal.SecurityIdentifier]).Value }
        if ($expectedSids -notcontains $sidVal) {
            throw "SID nao autorizado presente na ACL de '$resolvedPath': $sidVal ($($id.Value))"
        }
        if (($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne [System.Security.AccessControl.FileSystemRights]::FullControl) {
            throw "Direitos insuficientes para o SID $sidVal na ACL de '$resolvedPath': $($rule.FileSystemRights)"
        }
    }

    # 6. Se SourcePath foi fornecido, copia com seguranca para o destino ja protegido
    if (-not [string]::IsNullOrEmpty($resolvedSource)) {
        $bytes = [System.IO.File]::ReadAllBytes($resolvedSource)
        [System.IO.File]::WriteAllBytes($resolvedPath, $bytes)
    }

    Write-Output "[OK] Destino protegido com ACL restrita (Usuario Atual + SYSTEM): $resolvedPath"
    exit 0
}
catch {
    [Console]::Error.WriteLine("[ERRO CRITICO ACL] Falha ao proteger destino: $($_.Exception.Message)")
    exit 1
}
