# Migracao restrita ao endereco legado confirmado do PBX; outras URLs sao preservadas.
function Convert-IBPbxConfigText([string]$Text) {
    $pattern = '(?m)^(?<prefix>[ \t]*(?:export[ \t]+)?PBX_BASE_URL[ \t]*=[ \t]*)(?<quote>["'']?)(?i:https://pbx\.nossatelecom\.com\.br)/?\k<quote>(?<suffix>[ \t]*(?:#[^\r\n]*)?)(?=\r?$)'
    return [regex]::Replace($Text, $pattern, '${prefix}${quote}https://sip33.tsinfo.net.br${quote}${suffix}')
}

# Usado pelos instaladores. O atualizador usa seu proprio backup privado/rollback.
function Invoke-IBPbxInstallMigration([string]$Root) {
    $ErrorActionPreference = 'Stop'
    $file = Join-Path $Root '.env'
    $text = [IO.File]::ReadAllText($file)
    $updated = Convert-IBPbxConfigText $text
    if ($updated -ceq $text) { return }
    $backup = $file + '.pbx-backup-' + [guid]::NewGuid().ToString('N')
    foreach ($target in @($file, $backup)) {
        $probe = [IO.Path]::GetFullPath($target)
        while ($probe) {
            if ((Test-Path -LiteralPath $probe) -and ((Get-Item -LiteralPath $probe -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Link ou junction recusado.' }
            $probe = [IO.Path]::GetDirectoryName($probe)
        }
        if (-not [IO.File]::Exists($target)) { [IO.File]::WriteAllBytes($target, @()) }
        $acl = [Security.AccessControl.FileSecurity]::new()
        $acl.SetAccessRuleProtection($true, $false)
        $sids = @([Security.Principal.WindowsIdentity]::GetCurrent().User, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))
        foreach ($sid in $sids) { $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'Allow')) }
        Set-Acl -LiteralPath $target -AclObject $acl
        $check = Get-Acl -LiteralPath $target
        if (-not $check.AreAccessRulesProtected -or @($check.Access).Count -ne 2) { throw 'Permissoes privadas PBX nao confirmadas.' }
        foreach ($rule in $check.Access) {
            if ($rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($sids.Value) -or
                $rule.IsInherited -or $rule.AccessControlType -ne 'Allow' -or
                ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl) { throw 'Permissoes privadas PBX invalidas.' }
        }
    }
    [IO.File]::WriteAllBytes($backup, [IO.File]::ReadAllBytes($file))
    $bom = [IO.File]::ReadAllBytes($file)
    $hasBom = $bom.Length -ge 3 -and $bom[0] -eq 239 -and $bom[1] -eq 187 -and $bom[2] -eq 191
    [IO.File]::WriteAllText($file, $updated, [Text.UTF8Encoding]::new($hasBom))
    Write-Host 'PBX: endereco legado corrigido; backup privado criado.'
}
