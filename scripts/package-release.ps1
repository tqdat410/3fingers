$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

function Add-ArchiveFile($archive, $entryName, $sourceFile, $timestamp) {
  $entry = $archive.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
  $entry.LastWriteTime = $timestamp
  $inputStream = $sourceFile.OpenRead()
  $outputStream = $entry.Open()
  try {
    $inputStream.CopyTo($outputStream)
  } finally {
    $outputStream.Dispose()
    $inputStream.Dispose()
  }
}

Push-Location $projectRoot
try {
  node scripts/check.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Project checks failed' }
  $manifest = Get-Content -LiteralPath extension/manifest.json -Raw | ConvertFrom-Json
  $releaseName = "3fingers-$($manifest.version_name)"
  if ($releaseName -notmatch '^3fingers-\d+\.\d+\.\d+(?:-beta\.[1-9]\d*)?$') { throw 'Invalid release name' }
  $dist = Join-Path $projectRoot 'dist'
  New-Item -ItemType Directory -Force -Path $dist | Out-Null
  $zipPath = Join-Path $dist "$releaseName.zip"
  $runtimeFiles = @('manifest.json','background.js','content.js','feed-chrome.css','workspace.html','workspace.js','workspace.css','NOTICE.txt','shared/core.js')
  $assetFiles = @('assets/icons/icon-16.png','assets/icons/icon-32.png','assets/icons/icon-48.png','assets/icons/icon-128.png','assets/fonts/Ubuntu-Regular.ttf','assets/fonts/Ubuntu-Medium.ttf','assets/fonts/Ubuntu-Bold.ttf','assets/fonts/UFL.txt','assets/fonts/COPYRIGHT.txt')
  $sources = [ordered]@{}
  foreach ($file in ($runtimeFiles + $assetFiles)) { $sources[$file] = Join-Path $projectRoot "extension/$file" }
  $sources['LICENSE'] = Join-Path $projectRoot 'LICENSE'
  Add-Type -AssemblyName System.IO.Compression,System.IO.Compression.FileSystem
  $stream = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::Create)
  $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
  $archiveTimestamp = [DateTimeOffset]::new(2026,1,1,0,0,0,[TimeSpan]::Zero)
  try {
    foreach ($entryName in $sources.Keys) {
      $sourceFile = Get-Item -LiteralPath $sources[$entryName]
      if ($sourceFile.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw "Linked file is not allowed: $entryName" }
      Add-ArchiveFile $archive $entryName $sourceFile $archiveTimestamp
    }
  } finally { $archive.Dispose(); $stream.Dispose() }
  $inspection = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $entries = @($inspection.Entries | ForEach-Object FullName)
    if (Compare-Object ($sources.Keys | Sort-Object) ($entries | Sort-Object)) { throw 'Archive allowlist mismatch' }
    if ($entries -match '(^|/)(plans|\.git|node_modules|dist|\.env)(/|$)') { throw 'Forbidden archive path' }
  } finally { $inspection.Dispose() }
  $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content -LiteralPath "$zipPath.sha256" -Value "$hash  $releaseName.zip" -Encoding utf8NoBOM
  Write-Output "Created dist/$releaseName.zip ($((Get-Item -LiteralPath $zipPath).Length) bytes)"
  Write-Output "SHA256 $hash"
} finally { Pop-Location }
