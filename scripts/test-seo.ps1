param([string]$SiteRoot = (Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference = 'Stop'
trap { [Console]::Error.WriteLine("FAIL [site validation]: $($_.Exception.Message)"); exit 1 }
. (Join-Path $PSScriptRoot 'validate-static-site.ps1')
Test-StaticSite -Root $SiteRoot
