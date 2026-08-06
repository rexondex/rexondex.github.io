$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $projectRoot 'database'
$outputFile = Join-Path $projectRoot 'database.js'
$ids = @()

Get-ChildItem -LiteralPath $sourceDirectory -File |
    Where-Object { $_.Name -match '^\d{6}$' } |
    Sort-Object Name |
    ForEach-Object {
        $parsedDate = [DateTime]::MinValue
        $isValidDate = [DateTime]::TryParseExact(
            ('20' + $_.Name),
            'yyyyMMdd',
            [Globalization.CultureInfo]::InvariantCulture,
            [Globalization.DateTimeStyles]::None,
            [ref]$parsedDate
        )

        if ($isValidDate) {
            $ids += $_.Name
        }
    }

$items = $ids | ForEach-Object { "  '$_'" }
$javascript = "window.DIARY_FILES = [`n" + ($items -join ",`n") + "`n];`n"
$utf8WithoutBom = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText($outputFile, $javascript, $utf8WithoutBom)

Write-Host "database.js generated: $($ids.Count) file names"
