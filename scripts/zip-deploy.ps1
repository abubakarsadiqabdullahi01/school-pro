# Zips deploy/ for upload to cPanel.
#
# Not Compress-Archive and not ZipFile::CreateFromDirectory: on Windows
# PowerShell 5.1 both write entry names with BACKSLASH separators, which is
# invalid per the zip spec. Linux unzip then produces a flat directory of files
# literally named ".next\build-manifest.json" and the app never starts. Entries
# are therefore created by hand with forward slashes.
#
# Files are enumerated through System.IO rather than Get-ChildItem because the
# Next.js build output contains route directories like [id] and (roles), and
# PowerShell treats [ ] as wildcards while walking paths.
param(
  [string]$Source = (Join-Path $PSScriptRoot "..\deploy"),
  [string]$OutDir = (Join-Path $PSScriptRoot "..\outputs")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$Source = [System.IO.Path]::GetFullPath($Source)
if (-not (Test-Path $Source)) { throw "No deploy/ directory at $Source. Run: npm run build:deploy" }
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory $OutDir | Out-Null }

$zipPath = Join-Path ([System.IO.Path]::GetFullPath($OutDir)) ("digisoft-school-pro-cpanel-bundle-" + (Get-Date -Format 'yyyyMMdd-HHmm') + ".zip")
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$files = [System.IO.Directory]::EnumerateFiles($Source, "*", [System.IO.SearchOption]::AllDirectories)

$stream = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::CreateNew)
$archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create)
$count = 0
try {
  foreach ($file in $files) {
    $name = $file.Substring($Source.Length).TrimStart('\', '/').Replace('\', '/')
    if ($name -like '.env*' -or $name -like '*/.env*') { throw "Refusing to zip an env file: $name" }
    $entry = $archive.CreateEntry($name, [System.IO.Compression.CompressionLevel]::Optimal)
    $entryStream = $entry.Open()
    try {
      $input = [System.IO.File]::OpenRead($file)
      try { $input.CopyTo($entryStream) } finally { $input.Dispose() }
    } finally { $entryStream.Dispose() }
    $count++
  }
} finally {
  $archive.Dispose()
  $stream.Dispose()
}

$zip = Get-Item $zipPath
"Zipped {0:N0} files -> {1}" -f $count, $zip.Name
$mb = $zip.Length / 1MB
"Size: {0:N0} MB (~{1:N0} min to upload at 1 MB/s)" -f $mb, ($mb / 60)
"Extract its CONTENTS into the application root on the server."
