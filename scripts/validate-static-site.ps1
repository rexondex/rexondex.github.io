# Shared validation for in-memory builds and files already saved on disk.
function Test-StaticSite {
param([string]$Root, [System.Collections.IDictionary]$Overlay = @{})
$leafCache = [System.Collections.Generic.Dictionary[string,bool]]::new([StringComparer]::Ordinal)
function Test-SiteLeaf([string]$path) {
    if (@($Overlay.Keys) -ccontains $path) { return $true }
    if ($leafCache.ContainsKey($path)) { return $leafCache[$path] }
    # Match case exactly: Windows paths must also work on GitHub Pages.
    $current = $siteRoot
    foreach ($part in ($path -split '[/\\]')) {
        if (!$part -or $part -eq '.') { continue }
        if ($part -eq '..') { return $false }
        $child = @(Get-ChildItem -LiteralPath $current -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -ceq $part })
        if ($child.Count -ne 1) { return $false }
        $current = $child[0].FullName
    }
    $leafCache[$path] = [IO.File]::Exists($current)
    return $leafCache[$path]
}
# Validate generated pages and the complete local link graph without dependencies.
$ErrorActionPreference = 'Stop'
$siteRoot = [IO.Path]::GetFullPath($Root)
. (Join-Path $PSScriptRoot 'manifest.ps1')
function Assert([bool]$condition, [string]$message) {
    if (!$condition) { throw $message }
}
function Test-SameList($left, $right) {
    $a = @($left | Sort-Object -CaseSensitive)
    $b = @($right | Sort-Object -CaseSensitive)
    return $a.Count -eq $b.Count -and (($a -join "`n") -ceq ($b -join "`n"))
}
function Read-SiteFile([string]$path) {
    if ($Overlay.Contains($path)) { return $Overlay[$path] }
    [IO.File]::ReadAllText((Join-Path $siteRoot $path), [Text.Encoding]::UTF8)
}
$homeHtml = Read-SiteFile 'index.html'
$siteUrl = [uri]([regex]::Match($homeHtml, 'rel="canonical" href="([^"]+)"').Groups[1].Value)
$sitemap = [xml](Read-SiteFile 'sitemap.xml')
$locations = @($sitemap.urlset.url | ForEach-Object { [string]$_.loc })
Assert ($locations.Count -eq @($locations | Sort-Object -Unique).Count) 'Duplicate sitemap URLs.'
$diaryFiles = Read-DiaryFiles (Read-SiteFile 'database.js')
$diaryIds = @($diaryFiles.Keys | Sort-Object)
$diskDiaries = @(Get-ChildItem -LiteralPath (Join-Path $siteRoot 'database') -File | Where-Object { $_.Name -match '^[0-9]{6}\.html$' } | ForEach-Object { $_.Name })
Assert (Test-SameList @($diaryFiles.Values) $diskDiaries) 'Diary manifest differs from database/. Run the static builder.'
$sectors = @(Read-ManifestArray (Read-SiteFile 'pictures.js') 'PICTURE_SECTORS')
$expectedPages = @('index.html', 'archive.html') + @($diaryIds | ForEach-Object { 'database/' + $diaryFiles[$_] })
$expectedImages = @()
$diskSectors = @(Get-ChildItem -LiteralPath (Join-Path $siteRoot 'media') -Directory | ForEach-Object { $_.Name })
Assert (Test-SameList @($sectors | ForEach-Object { $_.id }) $diskSectors) 'Photo manifest differs from media/ sectors. Run the static builder.'
for ($i = 0; $i -lt $sectors.Count; $i++) {
    $sector = $sectors[$i]
    $gallery = if ($i -eq 0) { 'pictures.html' } else { "pictures/$($sector.id).html" }
    $expectedPages += $gallery
    $galleryHtml = Read-SiteFile $gallery
    Assert ($galleryHtml.Contains('data-picture-sector="' + $sector.id + '"')) "Wrong gallery state: $gallery"
    $photos = @(Get-ChildItem -LiteralPath (Join-Path $siteRoot "media/$($sector.id)") -File | Where-Object { $_.Name -match '\.(jpe?g|png|webp|gif|avif|heic)$' } | ForEach-Object { $_.Name })
    Assert (Test-SameList @($sector.files) $photos) "Photo list differs from media/$($sector.id)/. Run the static builder."
    Assert (([regex]::Matches($galleryHtml, '<img\b[^>]*src="\./media/')).Count -eq $photos.Count) "Gallery photo count mismatch: $gallery"
    foreach ($photo in $sector.files) {
        $photoPath = "media/$($sector.id)/$photo"
        Assert (Test-SiteLeaf $photoPath) "Missing photo or incorrect path case: $photoPath"
        $src = './media/' + $sector.id + '/' + [uri]::EscapeDataString($photo)
        Assert ($galleryHtml.Contains('src="' + $src + '"')) "Photo missing from gallery: $photoPath"
        if ($photo -notmatch '\.heic$') { $expectedImages += $siteUrl.AbsoluteUri + $src.Substring(2) }
    }
}
$expectedLocations = @($expectedPages | ForEach-Object { if ($_ -eq 'index.html') { $siteUrl.AbsoluteUri } else { $siteUrl.AbsoluteUri + $_ } })
Assert (Test-SameList $expectedLocations $locations) 'Sitemap does not match the complete set of current pages.'
foreach ($file in @(Get-ChildItem -LiteralPath (Join-Path $siteRoot 'pictures') -File -Filter '*.html' -ErrorAction SilentlyContinue)) {
    Assert ($expectedPages -ccontains "pictures/$($file.Name)") "Obsolete gallery: pictures/$($file.Name). Review and remove this old generated page, then rebuild."
}
$runtime = Read-SiteFile 'app.js'
Assert ($runtime.Contains('./media/${encodeURIComponent(sector)}/${encodeURIComponent(file)}')) 'app.js photo path must use media/<sector>/<file>.'
# The static HTML can be valid while the runtime hides it or emits an empty icon.
$navSource = [regex]::Match($runtime, '(?s)navItems\(\)\s*\{\s*return\s*\[(.*?)\]\.map').Groups[1].Value
$navItems = @([regex]::Matches($navSource, '\[''(?<view>[^'']+)'',\s*''[^'']+'',\s*''(?<icon>[^'']+)''\]'))
Assert ($navItems.Count -gt 0) 'Cannot validate app.js navigation configuration.'
$iconSource = [regex]::Match($runtime, '(?s)const paths = \{(.*?)\n  \};').Groups[1].Value
$viewSource = [regex]::Match($runtime, '(?s)showView\(view\)\s*\{.*?\[(.*?)\]\.forEach').Groups[1].Value
$viewNames = @([regex]::Matches($viewSource, '''([^'']+)''') | ForEach-Object { $_.Groups[1].Value })
$navViews = @($navItems | ForEach-Object { $_.Groups['view'].Value })
foreach ($item in $navItems) {
    $view = $item.Groups['view'].Value
    $icon = $item.Groups['icon'].Value
    Assert ($runtime.Contains('id="' + $view + 'View"')) "Navigation view '$view' has no matching section in app.js. Keep photo view IDs as picture; media/ is only the asset folder."
    Assert ($iconSource -match ('\b' + [regex]::Escape($icon) + '\s*:')) "Navigation icon '$icon' is missing from app.js paths."
}
Assert (Test-SameList $navViews $viewNames) 'app.js showView list does not match navigation views.'
$titles = @{}
$checkedLinks = 0
foreach ($location in $locations) {
    Assert ($location.StartsWith($siteUrl.AbsoluteUri, [StringComparison]::Ordinal)) "Sitemap URL outside site: $location"
    $uri = [uri]$location
    Assert (!$uri.Fragment -and !$uri.Query) "Non-canonical sitemap URL: $location"
    $relative = $siteUrl.MakeRelativeUri($uri).ToString()
    if (!$relative) { $relative = 'index.html' }
    Assert (Test-SiteLeaf $relative) "Missing page: $relative"
    $html = Read-SiteFile $relative
    $initialView = [regex]::Match($html, 'data-initial-view="([^"]+)"')
    if ($initialView.Success) { Assert ($navViews -ccontains $initialView.Groups[1].Value) "Unknown initial view in $relative" }
    Assert (([regex]::Matches($html, '<link rel="canonical"')).Count -eq 1) "Expected one canonical: $relative"
    Assert ($html.Contains('rel="canonical" href="' + $location + '"')) "Wrong canonical: $relative"
    Assert ($html.Contains('property="og:url" content="' + $location + '"')) "Wrong sharing URL: $relative"
    Assert ($html.Contains('<meta name="robots" content="index, follow, max-image-preview:large">')) "Robots mismatch: $relative"
    Assert ($html.Contains('src="./legacy-links.js"')) "Legacy fallback missing: $relative"
    Assert (([regex]::Matches($html, '<h1\b')).Count -eq 1) "Expected one static heading: $relative"
    $title = [regex]::Match($html, '<title>(.*?)</title>').Groups[1].Value
    Assert ($title -and !$titles.ContainsKey($title)) "Empty or duplicate title: $relative"
    $titles[$title] = $true
    $structured = [regex]::Match($html, '(?s)<script type="application/ld\+json">(.*?)</script>').Groups[1].Value | ConvertFrom-Json
    if ($relative -match '^database/([0-9]{6})\.html$') {
        $id = $Matches[1]
        Assert ($html.Contains('data-diary-id="' + $id + '"')) "Wrong diary state: $relative"
        Assert (([regex]::Matches($html, '<article\b')).Count -eq 1) "Expected one diary: $relative"
        $article = @($structured.'@graph' | Where-Object { $_.'@type' -eq 'BlogPosting' })
        Assert ($article.Count -eq 1 -and $article[0].mainEntityOfPage -eq $location) "Wrong article data: $relative"
        Assert ($html.Contains('<div class="post-content">')) "Static body missing: $relative"
    }
    $base = $uri
    $baseMatch = [regex]::Match($html, '<base href="([^"]+)"')
    if ($baseMatch.Success) { $base = [uri]::new($uri, $baseMatch.Groups[1].Value) }
    foreach ($match in [regex]::Matches($html, '(?i)\b(?:href|src)\s*=\s*["'']([^"'']+)["'']')) {
        $href = [Net.WebUtility]::HtmlDecode($match.Groups[1].Value)
        Assert ($href -notmatch '^\./(?:archive\.html)?#daily-') "Legacy diary link emitted: $relative"
        # Diary references may point to another repository on the same GitHub host.
        if ($href -match '^https?://') { continue }
        $target = [uri]::new($base, $href)
        if ($target.Scheme -notin @('http', 'https') -or $target.Host -ne $siteUrl.Host) { continue }
        $path = [uri]::UnescapeDataString($siteUrl.MakeRelativeUri([uri]($target.GetLeftPart([UriPartial]::Path))).ToString())
        if (!$path -or $path.EndsWith('/')) { $path += 'index.html' }
        Assert (Test-SiteLeaf $path) "Broken link in $relative -> $href"
        $checkedLinks++
    }
}
foreach ($id in $diaryIds) {
    Assert ($locations -contains "$($siteUrl.AbsoluteUri)database/$($diaryFiles[$id])") "Diary missing from sitemap: $id"
}
$imageNodes = @($sitemap.SelectNodes('//*[local-name()="image"]/*[local-name()="loc"]'))
Assert (Test-SameList $expectedImages @($imageNodes | ForEach-Object { $_.InnerText })) 'Image sitemap does not match current media files.'
foreach ($node in $imageNodes) {
    $imageUri = [uri]$node.InnerText
    Assert ($imageUri.AbsolutePath -notmatch '\.heic$') 'Unsupported HEIC image in image sitemap.'
    $path = [uri]::UnescapeDataString($siteUrl.MakeRelativeUri($imageUri).ToString())
    Assert (Test-SiteLeaf $path) "Missing sitemap image: $path"
}
Write-Output "PASS: $($locations.Count) pages, $($diaryIds.Count) diaries, $($imageNodes.Count) sitemap images and $checkedLinks local links."

}
