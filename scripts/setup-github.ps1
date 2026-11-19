# Menyiapkan repository GitHub untuk proyek ini.
# Jalankan SETELAH Git terpasang (winget install Git.Git atau GitHub Desktop).
#
# Contoh:
#   .\scripts\setup-github.ps1
#   .\scripts\setup-github.ps1 -RepoUrl "https://github.com/nama/repo.git" -Commit

param(
  [string]$RepoUrl = '',
  [switch]$Commit,
  [string]$CommitMessage = 'Initial commit: sistem pembayaran syariah Al-Marifah (mode demo)'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
  Write-Error 'Git belum terpasang. Install dulu: winget install Git.Git -e --accept-source-agreements --accept-package-agreements'
}

Set-Location $projectRoot

if (-not (Test-Path (Join-Path $projectRoot '.git'))) {
  Write-Host '==> git init'
  git init
} else {
  Write-Host '==> repository sudah ada, melewati git init'
}

Write-Host '==> git add .'
git add .

Write-Host ''
Write-Host '==> Berkas yang akan masuk commit (periksa: TIDAK boleh ada .env.local / data/runtime / node_modules):'
git status --short

Write-Host ''
Write-Host '==> Memeriksa file sensitif yang tidak boleh ter-commit:'
$blocked = @('.env.local', '.env', 'data/runtime', 'node_modules', '.next')
foreach ($item in $blocked) {
  $ignored = git check-ignore -q $item 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] $item ter-ignore"
  } else {
    Write-Warning "  [PERINGATAN] $item TIDAK ter-ignore - perbaiki .gitignore sebelum commit"
  }
}

if ($RepoUrl) {
  $existing = git remote get-url origin 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "==> origin sudah ada: $existing"
  } else {
    Write-Host "==> git remote add origin $RepoUrl"
    git remote add origin $RepoUrl
  }
}

if ($Commit) {
  Write-Host "==> git commit -m '$CommitMessage'"
  git commit -m $CommitMessage
  Write-Host ''
  Write-Host 'Commit dibuat. Push manual setelah remote siap:'
  Write-Host '  git branch -M main'
  Write-Host '  git push -u origin main'
} else {
  Write-Host ''
  Write-Host 'Periksa daftar di atas. Bila sudah aman, jalankan ulang dengan -Commit (dan -RepoUrl bila belum ada remote).'
}
