$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $projectRoot 'database'
$outputFile = Join-Path $projectRoot 'database.js'
$records = [ordered]@{}

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
            $records[$_.Name] = [IO.File]::ReadAllText($_.FullName, [Text.Encoding]::UTF8)
        }
    }

$json = $records | ConvertTo-Json -Depth 3 -Compress
$javascript = "window.ARCHIVE_DATABASE = $json;`n"
$utf8WithoutBom = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText($outputFile, $javascript, $utf8WithoutBom)

Write-Host "database.js generated: $($records.Count) records"
