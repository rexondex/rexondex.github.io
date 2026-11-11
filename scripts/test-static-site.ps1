# Integration checks run against a small disposable site, never the real diaries.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('archive-test-' + [guid]::NewGuid().ToString('N'))
$utf8 = New-Object Text.UTF8Encoding($false)
$builder = Join-Path $PSScriptRoot 'build-static-site.ps1'
function Put([string]$path, [string]$text) { [IO.File]::WriteAllText((Join-Path $fixture $path), $text, $utf8) }
function Snapshot {
    (@('index.html','archive.html','pictures.html','database.js','pictures.js','sitemap.xml','database/261101.html') | ForEach-Object {
        $path = Join-Path $fixture $_
        if (Test-Path -LiteralPath $path -PathType Leaf) { (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash }
    }) -join ':'
}
function Run-Build([string]$expectedError = '', [switch]$Check) {
    $before = Snapshot
    $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$builder,'-SiteRoot',$fixture)
    if ($Check) { $arguments += '-Check' }
    $ErrorActionPreference = 'Continue'
    try {
        $output = (& powershell @arguments 2>&1 | Out-String)
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = 'Stop' }
    if ($expectedError) {
        if ($code -eq 0 -or !$output.Contains($expectedError)) { throw "Expected failure '$expectedError': $output" }
        if ((Snapshot) -cne $before) { throw "Failed build modified generated files: $expectedError" }
    } elseif ($code -ne 0) { throw "Build failed: $output" }
    if ($Check -and (Snapshot) -cne $before) { throw 'Check mode wrote generated files.' }
}
try {
    [void][IO.Directory]::CreateDirectory($fixture)
    foreach ($name in @('database','media/PIC-1','pictures')) { [void][IO.Directory]::CreateDirectory((Join-Path $fixture $name)) }
    Get-ChildItem -LiteralPath $projectRoot -File | Copy-Item -Destination $fixture
    $sourcePhoto = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'media/PIC-1') -File -Filter '*.jpg' | Select-Object -First 1
    Copy-Item -LiteralPath $sourcePhoto.FullName -Destination (Join-Path $fixture 'media/PIC-1/photo.jpg')
    Put 'database/261101.html' '<p>Fixture diary.</p>'
    Run-Build
    Run-Build -Check
    Put 'database/261332.html' '<p>Invalid date.</p>'
    Run-Build 'Invalid diary date'
    Remove-Item -LiteralPath (Join-Path $fixture 'database/261332.html')
    $diary = [IO.File]::ReadAllText((Join-Path $fixture 'database/261101.html'))
    Put 'database/261101.html' ($diary.Replace('Fixture diary.', "Fixture diary.<img src='./media/PIC-1/missing.jpg' alt=''>"))
    Run-Build 'Broken link'
    Put 'database/261101.html' ($diary.Replace('Fixture diary.', "Fixture diary.<img src='./media/pic-1/photo.jpg' alt=''>"))
    Run-Build 'Broken link'
    Put 'database/261101.html' $diary
    Put 'pictures/obsolete.html' '<p>Old gallery.</p>'
    Run-Build 'Obsolete gallery'
    Remove-Item -LiteralPath (Join-Path $fixture 'pictures/obsolete.html')
    Put 'database.js' 'window.DIARY_FILES = [];'
    Run-Build 'out of date' -Check
    Run-Build
    [void][IO.Directory]::CreateDirectory((Join-Path $fixture 'picture'))
    Run-Build "Obsolete 'picture/'"
    Remove-Item -LiteralPath (Join-Path $fixture 'picture')
    Remove-Item -LiteralPath (Join-Path $fixture 'media/PIC-1/photo.jpg')
    Run-Build
    Run-Build -Check
    Remove-Item -LiteralPath (Join-Path $fixture 'media/PIC-1')
    Run-Build 'No photo sectors'
    Write-Output 'PASS: generation, check mode, empty gallery, invalid dates, missing/case-sensitive links, stale galleries, stale output and legacy folders; failed builds preserve outputs.'
} finally {
    $resolvedFixture = [IO.Path]::GetFullPath($fixture)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (!$resolvedFixture.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolvedFixture -Leaf) -notlike 'archive-test-*') { throw "Unsafe fixture cleanup path: $resolvedFixture" }
    if (Test-Path -LiteralPath $resolvedFixture) { Remove-Item -LiteralPath $resolvedFixture -Recurse -Force }
}
