# Produce independent small ZIPs for cPanel File Manager uploads.
# Extract every part into the same application root, in numeric order.
param(
  [string]$Source = (Join-Path $PSScriptRoot "..\deploy"),
  [string]$OutDir = (Join-Path $PSScriptRoot "..\outputs\cpanel-parts"),
  [int]$TargetMB = 8
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
$Source = [System.IO.Path]::GetFullPath($Source)
$OutDir = [System.IO.Path]::GetFullPath($OutDir)
if (-not (Test-Path -LiteralPath (Join-Path $Source "server.js"))) { throw "Build deploy/ first" }
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

$files = [System.IO.Directory]::EnumerateFiles($Source, "*", [System.IO.SearchOption]::AllDirectories)
$part = 0
$count = 0
$stream = $null
$archive = $null
$paths = New-Object System.Collections.Generic.List[string]

function Open-Part {
  $script:part++
  $name = "digisoft-school-pro-part-{0:D2}.zip" -f $script:part
  $path = Join-Path $OutDir $name
  $script:stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Create)
  $script:archive = [System.IO.Compression.ZipArchive]::new($script:stream, [System.IO.Compression.ZipArchiveMode]::Create)
  $script:paths.Add($path)
}

function Close-Part {
  if ($null -ne $script:archive) { $script:archive.Dispose(); $script:archive = $null }
  if ($null -ne $script:stream) { $script:stream.Dispose(); $script:stream = $null }
}

try {
  Open-Part
  foreach ($file in $files) {
    $name = $file.Substring($Source.Length).TrimStart('\', '/').Replace('\', '/')
    if ($name -like '.env*' -or $name -like '*/.env*') { throw "Refusing env file: $name" }
    $entry = $archive.CreateEntry($name, [System.IO.Compression.CompressionLevel]::Optimal)
    $entryStream = $entry.Open()
    try {
      $input = [System.IO.File]::OpenRead($file)
      try { $input.CopyTo($entryStream) } finally { $input.Dispose() }
    } finally { $entryStream.Dispose() }
    $count++
    if ($stream.Position -ge ($TargetMB * 1MB)) { Close-Part; Open-Part }
  }
} finally { Close-Part }

# A part is opened after reaching the target. Remove the unused final part.
$last = $paths[$paths.Count - 1]
if (([System.IO.File]::ReadAllBytes($last)).Length -le 22) {
  Remove-Item -LiteralPath $last
  $paths.RemoveAt($paths.Count - 1)
}
foreach ($path in $paths) {
  $size = [math]::Round((Get-Item -LiteralPath $path).Length / 1MB, 2)
  Write-Output ("{0}  {1} MB" -f (Split-Path $path -Leaf), $size)
}
Write-Output ("Packed {0} files into {1} parts" -f $count, $paths.Count)
