# HardWatch 自动构建脚本
# 每次运行自动递增版本号，输出到 release/vN
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location -LiteralPath $PSScriptRoot

$versionFile = '.build-version'
if (Test-Path $versionFile) {
    $current = [int](Get-Content $versionFile -Raw).Trim()
} else {
    $current = 0
}
$next = $current + 1

Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "   HardWatch  构建版本 v$next" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 写回版本号
Set-Content -Path $versionFile -Value $next -Encoding ascii -NoNewline

# 无 BOM UTF-8 写入器（PowerShell 5 的 Set-Content -Encoding UTF8 会带 BOM，破坏 JSON 解析）
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

# 2. 更新 package.json version（用正则只替换 version 字段，保留原文件格式与缩进）
$pkgPath = 'package.json'
$pkgRaw = [System.IO.File]::ReadAllText((Join-Path (Get-Location) $pkgPath), [System.Text.Encoding]::UTF8)
$newPkgRaw = [System.Text.RegularExpressions.Regex]::Replace(
    $pkgRaw,
    '("version"\s*:\s*")[^"]*(")',
    "`${1}1.0.$next`${2}"
)
[System.IO.File]::WriteAllText((Join-Path (Get-Location) $pkgPath), $newPkgRaw, $utf8NoBom)
Write-Host "[版本] package.json -> 1.0.$next" -ForegroundColor Gray

# 3. 更新 electron-builder.yml output 路径
$ymlPath = 'electron-builder.yml'
$yml = [System.IO.File]::ReadAllLines((Join-Path (Get-Location) $ymlPath), [System.Text.Encoding]::UTF8)
$yml = $yml -replace '^\s*output:.*', "  output: release/v$next"
[System.IO.File]::WriteAllText((Join-Path (Get-Location) $ymlPath), ($yml -join "`r`n") + "`r`n", $utf8NoBom)
Write-Host "[版本] electron-builder.yml -> release/v$next" -ForegroundColor Gray
Write-Host ""

# 4. 编译源代码
Write-Host "[1/3] 编译源代码 (npm run build)..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { throw "源代码编译失败 (exit=$LASTEXITCODE)" }

# 5. 打包
Write-Host ""
Write-Host "[2/3] 打包 Electron 应用 (electron-builder --win)..." -ForegroundColor Yellow
npx electron-builder --win
if ($LASTEXITCODE -ne 0) { throw "打包失败 (exit=$LASTEXITCODE)" }

# 6. 压缩 zip
Write-Host ""
Write-Host "[3/3] 压缩为 zip..." -ForegroundColor Yellow
$unpackDir = "release/v$next/win-unpacked"
$zipPath   = "release/v$next/HardWatch-v1.0.$next.zip"
if (Test-Path $unpackDir) {
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Compress-Archive -Path "$unpackDir\*" -DestinationPath $zipPath -Force
    Write-Host "[zip] $zipPath" -ForegroundColor Gray
} else {
    Write-Host "[zip] 跳过：未找到 $unpackDir" -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "   构建完成: release/v$next" -ForegroundColor Green
Write-Host "   可执行文件: release/v$next/win-unpacked/HardWatch.exe" -ForegroundColor Green
Write-Host "   压缩包:     $zipPath" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""
