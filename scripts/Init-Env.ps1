$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$target = Join-Path $root ".env"
if (Test-Path $target) {
    Write-Host ".env already exists and was not changed."
    exit 0
}
function New-Secret {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}
$content = [IO.File]::ReadAllText((Join-Path $root ".env.example"))
$content = $content.Replace("MEKORA_ADMIN_PASSWORD=", "MEKORA_ADMIN_PASSWORD=$(New-Secret)")
$content = $content.Replace("MEKORA_SIMULATOR_KEY=", "MEKORA_SIMULATOR_KEY=$(New-Secret)")
$content = $content.Replace("POSTGRES_PASSWORD=", "POSTGRES_PASSWORD=$(New-Secret)")
[IO.File]::WriteAllText($target, $content, (New-Object Text.UTF8Encoding $false))
Write-Host "Created .env with individual secrets. Login: admin. Password: MEKORA_ADMIN_PASSWORD in .env. Do not share .env."
