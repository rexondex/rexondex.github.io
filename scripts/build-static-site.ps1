param([string]$SiteRoot = (Split-Path $PSScriptRoot -Parent), [switch]$Check)
# Scan source folders, synchronize lists, and refresh the complete static site.
# No dependencies; compatible with Windows PowerShell 5.1 and PowerShell 7.
$ErrorActionPreference = 'Stop'
$phase = 'initialization'
trap {
    [Console]::Error.WriteLine("FAIL [$phase]: $($_.Exception.Message)")
    [Console]::Error.WriteLine("Location: $($_.InvocationInfo.ScriptName):$($_.InvocationInfo.ScriptLineNumber)")
    exit 1
}
$siteRoot = [IO.Path]::GetFullPath($SiteRoot)
. (Join-Path $PSScriptRoot 'manifest.ps1')
. (Join-Path $PSScriptRoot 'validate-static-site.ps1')
$utf8 = New-Object System.Text.UTF8Encoding($false)
$script:pendingFiles = [ordered]@{}
function Read-SiteFile([string]$path) {
    [System.IO.File]::ReadAllText((Join-Path $siteRoot $path), [System.Text.Encoding]::UTF8)
}
function Write-SiteFile([string]$path, [string]$content) {
    # Keep generated output in memory until every source page has passed validation.
    $script:pendingFiles[$path] = $content
}
function Escape-Html([string]$value) { [System.Net.WebUtility]::HtmlEncode($value) }

$phase = 'diary discovery'
Write-Output '[1/4] Reading diaries and media...'
$databaseRoot = Join-Path $siteRoot 'database'
if (!(Test-Path -LiteralPath $databaseRoot -PathType Container)) { throw "Diary folder not found: '$databaseRoot'. Create database/ and add a valid YYMMDD.html file." }
$diaryFolders = @(Get-ChildItem -LiteralPath $databaseRoot -Directory | Where-Object { $_.Name -match '^[0-9]{6}\.html$' })
if ($diaryFolders.Count) { throw "'$($diaryFolders[0].FullName)' is a folder, but diary entries must be HTML files. Put the diary content in a file named YYMMDD.html." }
$diaryFiles = @{}
foreach ($file in (Get-ChildItem -LiteralPath $databaseRoot -File)) {
    if ($file.Name -notmatch '^([0-9]{6})\.html$') { continue }
    $id = $Matches[1]
    try { [void][datetime]::ParseExact("20$id", 'yyyyMMdd', [Globalization.CultureInfo]::InvariantCulture) }
    catch { throw "Invalid diary date in '$($file.Name)'. Use a real date in YYMMDD.html format (example: 261030.html)." }
    $diaryFiles[$id] = $file.Name
}
$ids = @($diaryFiles.Keys | Sort-Object -Descending)
if (!$ids.Count) { throw "No publishable diaries found in '$databaseRoot'. Add a real-date YYMMDD.html file; drafts must use another name." }

# Preserve manually written photo descriptions while discovering files on disk.
$previousSectors = @{}
if (Test-Path -LiteralPath (Join-Path $siteRoot 'pictures.js')) {
    try {
        foreach ($sector in @(Read-ManifestArray (Read-SiteFile 'pictures.js') 'PICTURE_SECTORS')) { $previousSectors[$sector.id] = $sector }
    } catch { throw "Could not read photo descriptions from 'pictures.js'. Restore its generated array or fix its syntax: $($_.Exception.Message)" }
}
$imagePattern = '^[^/\\]+\.(jpe?g|png|webp|gif|avif|heic)$'
$imageLikePattern = '\.(jpe?g|png|webp|gif|avif|heic|bmp|svg|tiff?|ico|jfif|apng)$'
$mediaRoot = Join-Path $siteRoot 'media'
if (!(Test-Path -LiteralPath $mediaRoot -PathType Container)) { throw "Missing media/ folder. Store original photos in media/PIC-1/, media/PIC-2/, etc." }
foreach ($oldFolder in @('picture', 'picutre')) {
    if (Test-Path -LiteralPath (Join-Path $siteRoot $oldFolder)) { throw "Obsolete '$oldFolder/' folder found. Move photo sectors into media/; gallery HTML belongs in pictures/." }
}
$sectorFolders = @()
if (Test-Path -LiteralPath $mediaRoot -PathType Container) {
    if (Get-ChildItem -LiteralPath $mediaRoot -File | Where-Object { $_.Name -match $imageLikePattern }) {
        throw 'Photos must be inside a sector folder. Move them to media/sector-1/photo.jpg (or another sector folder).'
    }
    $sectorFolders = @(Get-ChildItem -LiteralPath $mediaRoot -Directory | Sort-Object { [regex]::Replace($_.Name, '\d+', { param($m) $m.Value.PadLeft(20, '0') }) })
}
$discoveredSectors = @(foreach ($folder in $sectorFolders) {
    $directFiles = @(Get-ChildItem -LiteralPath $folder.FullName -File)
    $files = @($directFiles | Where-Object { $_.Name -match $imagePattern } | Sort-Object { [regex]::Replace($_.Name, '\d+', { param($m) $m.Value.PadLeft(30, '0') }) } -Descending | ForEach-Object { $_.Name })
    $unsupportedImages = @($directFiles | Where-Object { $_.Name -match $imageLikePattern -and $_.Name -notmatch $imagePattern })
    if ($unsupportedImages.Count) { throw "Unsupported photo format '$($unsupportedImages[0].FullName)'. Use JPG, JPEG, PNG, WebP, GIF, AVIF or HEIC." }
    $nestedImages = @(Get-ChildItem -LiteralPath $folder.FullName -File -Recurse | Where-Object { $_.DirectoryName -ne $folder.FullName -and $_.Name -match $imageLikePattern })
    if ($nestedImages.Count) {
        throw "Nested photo folders are not supported. Move '$($nestedImages[0].FullName)' directly into '$($folder.FullName)'."
    }
    if ($folder.Name -notmatch '^[a-zA-Z0-9-]+$') {
        throw "Photo sector '$($folder.Name)' has an invalid name. Rename the folder using only letters, numbers and hyphens."
    }
    $descriptions = [ordered]@{}
    $previous = $previousSectors[$folder.Name]
    if ($previous -and $previous.descriptions) {
        foreach ($property in ($previous.descriptions.PSObject.Properties | Sort-Object Name)) {
            if ($files -contains $property.Name) { $descriptions[$property.Name] = $property.Value }
        }
    }
    [ordered]@{ id = $folder.Name; descriptions = $descriptions; files = $files }
})
if (!$discoveredSectors.Count) { throw 'No photo sectors found. Keep at least media/PIC-1/ (it may be empty) so pictures.html always has a gallery.' }
$listing = @($ids | Sort-Object | ForEach-Object { "  '$($diaryFiles[$_])'," }) -join "`n"
Write-SiteFile 'database.js' ("// Generated from database/ by scripts/build-static-site.ps1. Add HTML files to the folder.`nwindow.DIARY_FILES = [`n$listing`n];`n")
$pictureJson = ConvertTo-Json -InputObject $discoveredSectors -Depth 8
Write-SiteFile 'pictures.js' ("// File lists are generated from media/sector folders. Photo descriptions are preserved.`nwindow.PICTURE_SECTORS = $pictureJson;`n")
function Read-DiarySection([string]$html, [string]$className) {
    $opening = [regex]::Match($html, '(?is)<div\b(?=[^>]*\bclass\s*=\s*["''][^"'']*\b' + $className + '\b[^"'']*["''])[^>]*>')
    if (!$opening.Success) { return $null }
    $start = $opening.Index + $opening.Length
    $depth = 1
    foreach ($tag in [regex]::Matches($html.Substring($start), '(?is)<div\b[^>]*>|</div\s*>')) {
        if ($tag.Value -match '^</') { $depth-- } else { $depth++ }
        if ($depth -eq 0) { return $html.Substring($start, $tag.Index) }
    }
    throw "Unclosed $className div."
}
function Count-DiarySections([string]$html, [string]$className) {
    return [regex]::Matches($html, '(?is)<div\b(?=[^>]*\bclass\s*=\s*["''][^"'']*\b' + $className + '\b[^"'']*["''])[^>]*>').Count
}
function Assert-DiaryMarkup([string]$html, [string]$filePath, [string]$sectionName) {
    $allowedTags = @('a','abbr','article','aside','b','blockquote','br','cite','code','dd','del','div','dl','dt','em','figcaption','figure','footer','h1','h2','h3','h4','h5','h6','header','hr','i','img','kbd','li','mark','ol','p','pre','q','rp','rt','ruby','s','samp','section','small','span','strong','sub','sup','table','tbody','td','th','thead','time','tr','u','ul','var','wbr')
    $voidTags = @('area','br','col','hr','img','input','source','track','wbr')
    $stack = [System.Collections.Generic.List[string]]::new()
    $tokens = [regex]::Matches($html, '(?is)<!--.*?-->|<![^>]*>|</?[a-z][a-z0-9:-]*\b[^>]*>')
    foreach ($token in $tokens) {
        if ($token.Value.StartsWith('<!--') -or $token.Value.StartsWith('<!')) { continue }
        $parsedTag = [regex]::Match($token.Value, '(?is)^<\s*(?<close>/)?\s*(?<name>[a-z][a-z0-9:-]*)')
        $name = $parsedTag.Groups['name'].Value.ToLowerInvariant()
        if ($name -in @('script','style','iframe','object','embed','form','base','meta','link','html','head','body','noscript')) {
            throw "Diary '$filePath' has unsupported <$name> inside $sectionName. Keep page structure in the generator and place only diary content in this section."
        }
        if ($name -notin $allowedTags) { throw "Diary '$filePath' uses unsupported <$name> inside $sectionName. Use supported text and layout tags, or add this tag deliberately to the script's allowlist." }
        if ($token.Value -match '(?i)\son[a-z]+\s*=|\sstyle\s*=|\ssrcdoc\s*=') {
            throw "Diary '$filePath' has an inline event, style or embedded-document attribute in $sectionName. Remove it to keep generated pages safe and consistent."
        }
        $decodedTag = [Net.WebUtility]::HtmlDecode($token.Value)
        if ($decodedTag -match '(?i)\b(?:href|src)\s*=\s*(?:["'']\s*javascript\s*:|javascript\s*:)') {
            throw "Diary '$filePath' has a javascript: URL in $sectionName. Use an http:// or https:// link instead."
        }
        if ($name -eq 'a' -and !$parsedTag.Groups['close'].Success -and $token.Value -notmatch '(?i)\bhref\s*=') {
            throw "Diary '$filePath' has an <a> without href in $sectionName. Add href or remove the link tag."
        }
        if ($name -eq 'img' -and !$parsedTag.Groups['close'].Success -and $token.Value -notmatch '(?i)\bsrc\s*=') {
            throw "Diary '$filePath' has an <img> without src in $sectionName. Add an image path or remove the image tag."
        }
        if ($parsedTag.Groups['close'].Success) {
            if ($name -in $voidTags -or !$stack.Count -or $stack[$stack.Count - 1] -ne $name) {
                $expected = if ($stack.Count) { "</$($stack[$stack.Count - 1])>" } else { 'no closing tag' }
                throw "Diary '$filePath' has a mismatched </$name> in $sectionName; expected $expected."
            }
            $stack.RemoveAt($stack.Count - 1)
        } elseif ($name -notin $voidTags -and $token.Value -notmatch '/\s*>$') {
            $stack.Add($name)
        }
    }
    if ($stack.Count) { throw "Diary '$filePath' has an unclosed <$($stack[$stack.Count - 1])> in $sectionName. Add its closing tag." }
}
function Extract-DiaryLinkMarkers([string]$html) {
    $links = [System.Collections.Generic.List[string]]::new()
    $content = [regex]::Replace($html, '\[\[(?:(?<bare>https?://[^\]\s]+)|링크\|(?<url>https?://[^|\]\s]+)(?:\|(?<label>[^\]\r\n]+))?)\]\]', [System.Text.RegularExpressions.MatchEvaluator]{
        param($match)
        $rawUrl = if ($match.Groups['bare'].Success) { $match.Groups['bare'].Value } else { $match.Groups['url'].Value }
        $url = Escape-Html $rawUrl
        if ($match.Groups['label'].Success) { $label = Escape-Html $match.Groups['label'].Value }
        elseif ($match.Groups['bare'].Success) { $label = $url }
        else { $label = '링크' }
        $links.Add('<a class="post-reference" href="' + $url + '">' + $label + '</a>')
        ''
    })
    $content = [regex]::Replace($content, '(?is)<p>\s*</p>', '')
    [pscustomobject]@{ Content = $content; Links = @($links) }
}
function Convert-DiaryLinkMarkers([string]$html) {
    $parsed = Extract-DiaryLinkMarkers $html
    return $parsed.Content + ($parsed.Links -join '')
}
function Convert-PlainDiaryText([string]$content) {
    if ($content -match '(?is)<[a-z][^>]*>') { return $content }
    $paragraphs = [regex]::Split($content.Trim(), '\r?\n[\t ]*\r?\n+') | Where-Object { $_.Trim() }
    return (@($paragraphs | ForEach-Object {
        $lines = $_ -split '\r?\n' | ForEach-Object { Escape-Html $_.Trim() }
        '<p>' + ($lines -join '<br>') + '</p>'
    }) -join "`n")
}

function Render-Shell([string]$heading, [string]$body, [string]$navigation) {
    @"
<div class="social-shell">
  <header class="mobile-header"><a href="./">rexondex</a></header>
  <aside class="side-nav"><a class="wordmark" href="./"><img class="brand-logo" src="./favicon.svg" alt=""><span>rexondex</span><small>archive</small></a><nav aria-label="주요 메뉴"><a href="./">일기</a><a href="./pictures.html">사진</a></nav></aside>
  <main class="main-column"><section class="view feed-view" aria-labelledby="static-title">
    <header class="view-header"><h1 id="static-title">$heading</h1></header>
    $body
    <footer class="diary-post">$navigation</footer>
  </section></main>
</div>
"@
}
# Read the home head as the shared metadata/icon/style template. Runtime scripts are
# added explicitly in document order; nested pages use a base URL for all assets.
$homeHtml = Read-SiteFile 'index.html'
$templateMatch = [regex]::Match($homeHtml, '(?s)<head>(.*?)</head>')
if (!$templateMatch.Success) { throw "Home template 'index.html' has no complete <head> section. Restore a generated home page before running the updater." }
$template = $templateMatch.Groups[1].Value
$siteUrlMatch = [regex]::Match($template, '<link rel="canonical" href="([^"]+)"')
if (!$siteUrlMatch.Success) { throw "Home template 'index.html' has no canonical URL. Restore its canonical link before running the updater." }
$canonicalText = $siteUrlMatch.Groups[1].Value
$siteUri = $null
if (!$canonicalText.EndsWith('/') -or ![uri]::TryCreate($canonicalText, [UriKind]::Absolute, [ref]$siteUri)) {
    throw "Home canonical in 'index.html' must be an absolute HTTPS URL ending in / (example: https://example.github.io/)."
}
if ($siteUri.Scheme -ne 'https' -or $siteUri.Query -or $siteUri.Fragment) {
    throw "Home canonical in 'index.html' must be an absolute HTTPS URL ending in / (example: https://example.github.io/)."
}
$requiredHeadPatterns = @(
    @{ Name = 'title'; Pattern = '(?is)<title\b.*?</title>' },
    @{ Name = 'meta description'; Pattern = '(?i)<meta\s+name="description"\s+content="[^"]*"\s*/?>' },
    @{ Name = 'robots directive'; Pattern = '(?i)<meta\s+name="robots"\s+content="[^"]*"\s*/?>' },
    @{ Name = 'Open Graph URL'; Pattern = '(?i)<meta\s+property="og:url"\s+content="[^"]*"\s*/?>' },
    @{ Name = 'Twitter title'; Pattern = '(?i)<meta\s+name="twitter:title"\s+content="[^"]*"\s*/?>' }
)
foreach ($required in $requiredHeadPatterns) {
    if ([regex]::Matches($template, $required.Pattern).Count -ne 1) { throw "Home template 'index.html' must contain exactly one $($required.Name) tag. Restore a generated head before running the updater." }
}
$siteUrl = $siteUri.AbsoluteUri
$graphMatch = [regex]::Match($template, '(?s)<script type="application/ld\+json">(.*?)</script>')
if (!$graphMatch.Success) { throw "Home template 'index.html' has no JSON-LD block. Restore a generated home page before running the updater." }
try { $graph = (($graphMatch.Groups[1].Value | ConvertFrom-Json).'@graph') }
catch { throw "Could not parse JSON-LD in 'index.html': $($_.Exception.Message)" }
if (!$graph) { throw "Home template 'index.html' has no JSON-LD @graph. Restore its structured data before running the updater." }
$template = [regex]::Replace($template, '(?s)\s*<script\b.*?</script>', '')
$template = [regex]::Replace($template, '\s*<base\b[^>]*>', '')
$template = $template.Trim()

function Render-Page([string]$path, [string]$title, [string]$description, [string]$body,
    [bool]$interactive = $false, [string]$attributes = '', $entity = $null) {
    $url = if ($path -eq 'index.html') { $siteUrl } else { $siteUrl + $path }
    $head = $template
    $safeTitle = Escape-Html $title
    $safeDescription = Escape-Html $description
    $head = [regex]::Replace($head, '<title>.*?</title>', [System.Text.RegularExpressions.MatchEvaluator]{ param($m) "<title>$safeTitle</title>" })
    # Ask touch browsers to keep the page at its designed scale and avoid
    # double-tap zoom. Some browsers may still permit zoom for accessibility.
    $head = [regex]::Replace($head, '(?i)(<meta\s+name="viewport"\s+content=")[^"]*(")', '${1}width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no${2}')
    foreach ($name in @('description', 'og:description', 'twitter:description')) {
        $head = [regex]::Replace($head, '((?:name|property)="' + $name + '" content=")[^"]*', [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $m.Groups[1].Value + $safeDescription })
    }
    foreach ($name in @('og:title', 'twitter:title')) {
        $head = [regex]::Replace($head, '((?:name|property)="' + $name + '" content=")[^"]*', [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $m.Groups[1].Value + $safeTitle })
    }
    $head = [regex]::Replace($head, '(rel="canonical" href=")[^"]*', '${1}' + $url)
    $head = [regex]::Replace($head, '(property="og:url" content=")[^"]*', '${1}' + $url)
    if ($entity -and $entity.'@type' -eq 'BlogPosting') {
        $head = $head.Replace('property="og:type" content="website"', 'property="og:type" content="article"')
        $head += "`n<meta property=""article:published_time"" content=""$($entity.datePublished)"">"
    }
    $pageGraph = @($graph)
    if ($entity) { $pageGraph += $entity }
    $json = [ordered]@{ '@context' = 'https://schema.org'; '@graph' = $pageGraph } | ConvertTo-Json -Depth 15
    # Prevent diary text inside JSON-LD from terminating its script element.
    $json = $json.Replace('<', '\u003c').Replace('>', '\u003e').Replace('&', '\u0026')
    $base = if ($path.Contains('/')) { '<base href="../">' } else { '' }
    $scripts = '<script src="./legacy-links.js"></script><script src="./theme-init.js"></script>'
    if ($interactive) {
        $scripts += '<script defer src="./database.js"></script><script defer src="./pictures.js"></script><script defer src="./app.js"></script>'
    }
    $noscript = '<noscript><p>달력과 테마 설정은 JavaScript를 활성화하면 사용할 수 있습니다. <a href="./">메인</a> · <a href="./archive.html">전체 일기</a> · <a href="./pictures.html">사진</a></p></noscript>'
    Write-SiteFile $path "<!doctype html>`n<html lang=""ko"">`n<head>`n$base$head`n<script type=""application/ld+json"">$json</script>`n$scripts`n</head>`n<body $attributes><div id=""app"">`n<!-- STATIC-ARCHIVE:START -->`n$body`n<!-- STATIC-ARCHIVE:END -->`n</div>$noscript</body>`n</html>`n"
}

$phase = 'page rendering'
Write-Output '[2/4] Rendering static pages in memory...'
$culture = [Globalization.CultureInfo]::GetCultureInfo('ko-KR')
$posts = for ($i = 0; $i -lt $ids.Count; $i++) {
    $id = $ids[$i]
    $path = "database/$($diaryFiles[$id])"
    $html = Read-SiteFile $path
    $isFullDocument = $html -match '(?i)<(?:html|head|body)\b|<!doctype'
    $contentCount = Count-DiarySections $html 'post-content'
    $referenceCount = Count-DiarySections $html 'post-references'
    if ($contentCount -gt 1) { throw "Diary '$path' has $contentCount .post-content sections. Keep exactly one body section." }
    if ($referenceCount -gt 1) { throw "Diary '$path' has $referenceCount .post-references sections. Keep at most one reference section." }
    if ($isFullDocument -and $contentCount -ne 1) { throw "Diary '$path' is a full HTML document but has no .post-content section. Add exactly one <div class='post-content'> around the diary body." }
    if ($isFullDocument) {
        foreach ($tagName in @('html','head','body')) {
            if ([regex]::Matches($html, '(?i)<\s*' + $tagName + '\b').Count -ne 1 -or [regex]::Matches($html, '(?i)</\s*' + $tagName + '\s*>').Count -ne 1) {
                throw "Diary '$path' has an incomplete or duplicated <$tagName> document section. Keep one matching opening and closing <$tagName> tag, or use an HTML fragment instead."
            }
        }
    }
    try {
        $content = Read-DiarySection $html 'post-content'
        $references = Read-DiarySection $html 'post-references'
    } catch {
        throw "Could not parse diary '$path': $($_.Exception.Message)"
    }
    if ($null -eq $content) {
        $content = $html.Trim()
    }
    if ([regex]::IsMatch($content, '(?is)<[^>]*\[\[[^>]*>')) {
        throw "Diary '$path' has a [[ link marker inside an HTML tag or attribute. Put [[https://...]] in the visible body text instead."
    }
    Assert-DiaryMarkup $content $path '.post-content'
    if ($null -ne $references) { Assert-DiaryMarkup $references $path '.post-references' }
    $parsedLinks = Extract-DiaryLinkMarkers $content
    if ($parsedLinks.Content -match '\[\[') { throw "Diary '$path' has an unrecognized [[ link marker. Use [[https://example.com]] or [[링크|https://example.com|label]]." }
    $content = $parsedLinks.Content
    $content = Convert-PlainDiaryText $content
    if ($null -ne $references) {
        $references = Convert-DiaryLinkMarkers $references
        if ($references -match '\[\[') { throw "Diary '$path' has an unrecognized [[ link marker in .post-references. Use [[https://example.com]] or a complete HTML <a href='...'> link." }
    }
    if ($parsedLinks.Links.Count) {
        $references = (@($references) + @($parsedLinks.Links) | Where-Object { $null -ne $_ }) -join ''
    }
    if (!$content.Trim()) { throw "Diary '$path' has an empty body. Add diary text or rename it as a draft so it is not published." }
    $date = [datetime]::ParseExact("20$id", 'yyyyMMdd', [Globalization.CultureInfo]::InvariantCulture)
    $iso = $date.ToString('yyyy-MM-dd')
    $label = $date.ToString('yyyy년 M월 d일', $culture)
    $longLabel = Escape-Html ($date.ToString('D', $culture))
    $shortDate = $date.ToString('yy.MM.dd')
    # Only a leading date-only paragraph is normalized; prose dates are preserved.
    $content = [regex]::Replace($content, '^\s*<p>\s*\d{2}\.\d{2}\.\d{2}\s*</p>', "<p>$shortDate</p>")
    $summary = [regex]::Replace($content, '(?is)<(?:script|style)\b.*?</(?:script|style)>', '')
    $summary = [Net.WebUtility]::HtmlDecode([regex]::Replace($summary, '<[^>]+>', ' '))
    $summary = [regex]::Replace($summary, '\s+', ' ').Trim()
    $summary = [regex]::Replace($summary, '^\d{2}\.\d{2}\.\d{2}\s*', '')
    if ($summary.Length -gt 150) { $summary = $summary.Substring(0, 150) + '…' }
    $description = "$label 일기. $summary"
    $referenceHtml = if ($null -ne $references) { '<div class="post-references" aria-label="참고 링크">' + $references + '</div>' } else { '' }
    $post = @"
<article class="diary-post" id="daily-$id" aria-label="$longLabel">
  <header><img class="post-avatar" src="./rexondex.jpg" alt="" width="44" height="44" loading="lazy"><div><strong>rexondex</strong><time datetime="$iso">$longLabel</time></div></header>
  $referenceHtml
  <div class="post-content">$content</div>
  <footer><a class="post-permalink" href="./$path">$id &#183; &#47553;&#53356;</a></footer>
</article>
"@
    $navigation = '<a href="./">메인</a> · <a href="./archive.html">전체 일기</a>'
    if ($i -gt 0) { $navigation += " · <a href=""./database/$($diaryFiles[$ids[$i - 1]])"">다음 일기</a>" }
    if ($i -lt $ids.Count - 1) { $navigation += " · <a href=""./database/$($diaryFiles[$ids[$i + 1]])"">이전 일기</a>" }
    $entity = [ordered]@{
        '@type' = 'BlogPosting'; '@id' = "$siteUrl$path#article"
        headline = "$label 일기"; description = $description; datePublished = $iso
        inLanguage = 'ko'; author = [ordered]@{ '@id' = "$($siteUrl)#author" }
        mainEntityOfPage = "$siteUrl$path"
    }
    $body = Render-Shell "$label 일기" $post $navigation
    Render-Page $path "$label 일기 | rexondex Archive" $description $body $true "data-diary-id=""$id""" $entity
    $post
}

$homeDescription = 'rexondex의 일기와 사진을 모은 개인 디지털 아카이브입니다. 일상의 기록과 참고 링크를 달력으로 탐색할 수 있습니다.'
$homeContent = Render-Shell '일기' (($posts | Select-Object -First 8) -join "`n") '<a href="./archive.html">전체 일기 보기</a> · <a href="./pictures.html">사진 보기</a>'
Render-Page 'index.html' 'rexondex Archive' $homeDescription $homeContent $true
$archive = Render-Shell '전체 일기' ($posts -join "`n") '<a href="./">일기장으로 돌아가기</a>'
Render-Page 'archive.html' '전체 일기 | rexondex Archive' 'rexondex의 전체 일기를 최신 날짜순으로 읽고, 각 날짜의 일기와 참고 링크를 찾아볼 수 있습니다.' $archive $true 'data-all-entries="true"'

$sitemapEntries = [System.Collections.Generic.List[string]]::new()
$sitemapEntries.Add("<url><loc>$siteUrl</loc></url>")
$sitemapEntries.Add("<url><loc>$($siteUrl)archive.html</loc></url>")
foreach ($id in $ids) {
    $sitemapEntries.Add("<url><loc>$($siteUrl)database/$($diaryFiles[$id])</loc></url>")
}

$sectors = @(($pictureJson | ConvertFrom-Json) | Sort-Object { [regex]::Replace($_.id, '\d+', { param($m) $m.Value.PadLeft(20, '0') }) })
for ($i = 0; $i -lt $sectors.Count; $i++) {
    $sector = $sectors[$i]
    if ($sector.id -notmatch '^[a-zA-Z0-9-]+$') { throw 'Invalid picture sector ID.' }
    $path = if ($i -eq 0) { 'pictures.html' } else { "pictures/$($sector.id).html" }
    $sectorLinks = for ($j = 0; $j -lt $sectors.Count; $j++) {
        $href = if ($j -eq 0) { './pictures.html' } else { "./pictures/$($sectors[$j].id).html" }
        "<a href=""$href"">$(Escape-Html $sectors[$j].id)</a>"
    }
    $images = foreach ($file in ($sector.files | Sort-Object -Unique -Descending)) {
        if ($file -notmatch '^[^/\\]+\.(jpe?g|png|webp|gif|avif|heic)$') { throw "Invalid picture filename: $file" }
        if (!(Test-Path -LiteralPath (Join-Path $siteRoot "media/$($sector.id)/$file"))) { throw "Missing picture: $file" }
        $src = "./media/$($sector.id)/$([uri]::EscapeDataString($file))"
        $alt = ''
        if ($sector.descriptions -and $sector.descriptions.PSObject.Properties[$file]) { $alt = Escape-Html $sector.descriptions.PSObject.Properties[$file].Value }
        $label = if ($alt) { $alt } else { Escape-Html "$($sector.id)/$file 사진 크게 보기" }
        "<a class=""picture-tile"" href=""$src"" aria-label=""$label""><img src=""$src"" alt=""$alt"" loading=""lazy"" decoding=""async""></a>"
    }
    $content = '<div class="picture-toolbar"><nav class="picture-sector-nav" aria-label="사진 섹터">' + ($sectorLinks -join '') + '</nav><span>' + $sector.files.Count + '장</span></div><div class="picture-grid">' + ($images -join "`n") + '</div>'
    $body = Render-Shell '사진' $content '<a href="./">일기장으로 돌아가기</a>'
    $body = $body.Replace('view feed-view', 'view picture-view')
    $entity = [ordered]@{ '@type' = 'CollectionPage'; name = "rexondex 사진 $($sector.id)"; url = $siteUrl + $path; inLanguage = 'ko' }
    Render-Page $path "사진 $($sector.id) | rexondex Archive" "rexondex의 $($sector.id) 사진 아카이브입니다. $($sector.files.Count)장의 사진을 둘러보고 원본을 열어볼 수 있습니다." $body $true "data-initial-view=""picture"" data-picture-sector=""$($sector.id)""" $entity
    # HEIC is available to visitors but isn't a supported Google Images format.
    $imageEntries = foreach ($file in $sector.files) {
        if ($file -notmatch '\.heic$') {
            '<image:image><image:loc>' + $siteUrl + 'media/' + $sector.id + '/' + [uri]::EscapeDataString($file) + '</image:loc></image:image>'
        }
    }
    $sitemapEntries.Add("<url><loc>$siteUrl$path</loc>$($imageEntries -join '')</url>")
}
Write-SiteFile 'sitemap.xml' ('<?xml version="1.0" encoding="UTF-8"?>' + "`n" + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' + "`n" + ($sitemapEntries -join "`n") + "`n</urlset>`n")
$phase = 'site consistency validation'
Write-Output '[3/4] Checking pages, manifests, media and local links...'
Test-StaticSite -Root $siteRoot -Overlay $script:pendingFiles
if ($Check) {
    $changed = @($script:pendingFiles.Keys | Where-Object {
        !(Test-Path -LiteralPath (Join-Path $siteRoot $_) -PathType Leaf) -or (Read-SiteFile $_) -cne $script:pendingFiles[$_]
    })
    if ($changed.Count) { throw "Generated output is out of date: $($changed -join ', '). Run scripts/build-static-site.ps1 without -Check to render it." }
    Write-Output '[4/4] PASS: generated files are current; no files changed.'
    return
}
$phase = 'writing generated files'
Write-Output '[4/4] Saving validated pages with rollback protection...'
# All parsing and generation completed in memory. Stage every output and backup before replacing any file.
$writeId = [guid]::NewGuid().ToString('N')
$transactions = [System.Collections.Generic.List[object]]::new()
$commitComplete = $false
$rollbackComplete = $true
try {
    foreach ($path in $script:pendingFiles.Keys) {
        $target = Join-Path $siteRoot $path
        if (Test-Path -LiteralPath $target -PathType Container) { throw "Cannot write generated file '$path' because a folder exists at that file path. Rename or move the conflicting folder, then retry." }
        [System.IO.Directory]::CreateDirectory((Split-Path $target -Parent)) | Out-Null
        $item = [pscustomobject]@{
            Path = $path; Target = $target
            Temp = "$target.seo-tmp-$writeId"
            Backup = "$target.seo-backup-$writeId"
            HadOriginal = [System.IO.File]::Exists($target)
            Applied = $false
        }
        $transactions.Add($item)
        [System.IO.File]::WriteAllText($item.Temp, $script:pendingFiles[$path], $utf8)
        if ($item.HadOriginal) { [System.IO.File]::Copy($target, $item.Backup, $false) }
    }
    foreach ($item in $transactions) {
        $item.Applied = $true
        Move-Item -LiteralPath $item.Temp -Destination $item.Target -Force
    }
    $commitComplete = $true
} catch {
    $writeError = $_.Exception.Message
    for ($i = $transactions.Count - 1; $i -ge 0; $i--) {
        $item = $transactions[$i]
        if (!$item.Applied) { continue }
        try {
            if ($item.HadOriginal -and [System.IO.File]::Exists($item.Backup)) {
                [System.IO.File]::Copy($item.Backup, $item.Target, $true)
            } elseif (!$item.HadOriginal -and [System.IO.File]::Exists($item.Target)) {
                [System.IO.File]::Delete($item.Target)
            }
        } catch { $rollbackComplete = $false }
    }
    if (!$rollbackComplete) {
        $recovery = @($transactions | Where-Object { [System.IO.File]::Exists($_.Backup) } | ForEach-Object { $_.Backup }) -join ', '
        throw "Could not finish writing generated files: $writeError. Automatic rollback was incomplete; original backups were retained at: $recovery"
    }
    throw "Could not write generated files: $writeError. Existing outputs were restored; fix the filesystem issue and run the command again."
} finally {
    foreach ($item in $transactions) {
        try { if ([System.IO.File]::Exists($item.Temp)) { [System.IO.File]::Delete($item.Temp) } } catch { Write-Warning "Could not remove temporary file '$($item.Temp)': $($_.Exception.Message)" }
        try { if (($commitComplete -or $rollbackComplete) -and [System.IO.File]::Exists($item.Backup)) { [System.IO.File]::Delete($item.Backup) } } catch { Write-Warning "Could not remove temporary backup '$($item.Backup)': $($_.Exception.Message)" }
    }
}
Write-Output "Updated snapshots and sitemap for $($ids.Count) existing HTML diaries and $($sectors.Count) galleries."
