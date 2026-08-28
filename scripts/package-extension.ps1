$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$distPath = Join-Path $projectRoot "dist"
$releasePath = Join-Path $projectRoot "release"
$packagePath = Join-Path $projectRoot "package.json"
$version = (Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json).version
$archivePath = Join-Path $releasePath "gmgn-vamp-v$version.zip"

Push-Location $projectRoot
try {
  $env:VAMP_RELEASE_BUILD = "1"
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Extension build failed." }
} finally {
  Remove-Item Env:VAMP_RELEASE_BUILD -ErrorAction SilentlyContinue
  Pop-Location
}

New-Item -ItemType Directory -Force -Path $releasePath | Out-Null
$resolvedRelease = (Resolve-Path -LiteralPath $releasePath).Path
if (-not $archivePath.StartsWith($resolvedRelease + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to replace an archive outside the release directory."
}
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
Compress-Archive -Path (Join-Path $distPath "*") -DestinationPath $archivePath -CompressionLevel Optimal
Write-Output "Packaged $archivePath"
