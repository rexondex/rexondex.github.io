$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceFiles = @(
    'src/domain/diary.js',
    'src/infrastructure/http-diary-repository.js',
    'src/application/archive-store.js',
    'src/presentation/theme-manager.js',
    'src/presentation/archive-app.js',
    'src/main.js'
)

$parts = foreach ($relativePath in $sourceFiles) {
    $absolutePath = Join-Path $projectRoot $relativePath
    $source = [IO.File]::ReadAllText($absolutePath, [Text.Encoding]::UTF8)
    $source = [regex]::Replace($source, '(?m)^import .+;\r?\n', '')
    $source = [regex]::Replace($source, '(?m)^export ', '')
    "// Source: $relativePath`n$source"
}

$bundle = "(() => {`n'use strict';`n" + ($parts -join "`n`n") + "`n})();`n"
$outputFile = Join-Path $projectRoot 'app.js'
$utf8WithoutBom = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText($outputFile, $bundle, $utf8WithoutBom)

Write-Host "app.js generated from $($sourceFiles.Count) modules"
