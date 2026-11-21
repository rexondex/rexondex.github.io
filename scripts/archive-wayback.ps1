param(
    [string]$SiteRoot = (Split-Path $PSScriptRoot -Parent),
    [switch]$ListOnly,
    [ValidateRange(1, 100000)][int]$StartAt = 1,
    [ValidateRange(1, 3600)][int]$PollSeconds = 10,
    [ValidateRange(1, 86400)][int]$TimeoutSeconds = 300
)
# Submit sitemap page URLs to Internet Archive Save Page Now (SPN2).
# Windows PowerShell 5.1 and PowerShell 7; no dependencies.
$ErrorActionPreference = 'Stop'
try {
    $path = Join-Path ([IO.Path]::GetFullPath($SiteRoot)) 'sitemap.xml'
    [xml]$sitemap = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
    $ns = New-Object System.Xml.XmlNamespaceManager($sitemap.NameTable)
    $ns.AddNamespace('sm', 'http://www.sitemaps.org/schemas/sitemap/0.9')
    $nodes = $sitemap.SelectNodes('/sm:urlset/sm:url/sm:loc', $ns)
    if (!$nodes.Count) { throw 'No page URLs found in sitemap.xml.' }
    $urls = New-Object 'System.Collections.Generic.List[string]'
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    foreach ($node in $nodes) {
        $url = $node.InnerText.Trim()
        $uri = $null
        if (![Uri]::TryCreate($url, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.Host -ne 'rexondex.github.io' -or $uri.UserInfo -or $uri.Fragment) {
            throw "Invalid or external sitemap URL: $url"
        }
        if ($seen.Add($url)) { $urls.Add($url) }
    }
    if ($StartAt -gt $urls.Count) { throw "StartAt exceeds the URL count ($($urls.Count))." }
    Write-Output "Page URLs: $($urls.Count); starting at: $StartAt"
    if ($ListOnly) {
        for ($i = $StartAt - 1; $i -lt $urls.Count; $i++) { Write-Output "[$($i + 1)/$($urls.Count)] $($urls[$i])" }
        exit 0
    }
    if (!$env:IA_ACCESS_KEY -or !$env:IA_SECRET_KEY) { throw 'Set IA_ACCESS_KEY and IA_SECRET_KEY environment variables first. See README.md.' }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $headers = @{ Authorization = "LOW $($env:IA_ACCESS_KEY):$($env:IA_SECRET_KEY)"; Accept = 'application/json' }
    for ($i = $StartAt - 1; $i -lt $urls.Count; $i++) {
        $url = $urls[$i]
        Write-Output "[$($i + 1)/$($urls.Count)] Submitting $url"
        try {
            $job = Invoke-RestMethod -Uri 'https://web.archive.org/save' -Method Post -Headers $headers -Body @{ url = $url } -TimeoutSec 60
            if (!$job.job_id -or $job.job_id -notmatch '^[a-zA-Z0-9_-]+$') { throw 'The API did not return a valid job_id.' }
            Write-Output "Job: $($job.job_id)"
            $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
            do {
                Start-Sleep -Seconds $PollSeconds
                $status = Invoke-RestMethod -Uri "https://web.archive.org/save/status/$($job.job_id)" -Headers $headers -TimeoutSec 60
                if ($status.status -eq 'success') {
                    Write-Output "Saved: $url (job $($job.job_id))"
                    break
                }
                if ($status.status -ne 'pending') { throw "Archive job ended with status '$($status.status)': $($status.message) $($status.exception)" }
            } while ([DateTime]::UtcNow -lt $deadline)
            if ($status.status -ne 'success') { throw "Timed out waiting for job $($job.job_id); it may still be running." }
        } catch {
            [Console]::Error.WriteLine("Failed at URL $($i + 1): $url`n$($_.Exception.Message)")
            [Console]::Error.WriteLine("After checking the job, resume with -StartAt $($i + 1).")
            exit 1
        }
    }
    Write-Output "Finished: $($urls.Count - $StartAt + 1) page(s) reported success."
} catch {
    [Console]::Error.WriteLine("FAIL: $($_.Exception.Message)")
    exit 1
}
