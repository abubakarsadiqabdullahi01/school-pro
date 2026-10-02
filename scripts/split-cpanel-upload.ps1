param(
  [Parameter(Mandatory = $true)]
  [string]$Source,
  [Parameter(Mandatory = $true)]
  [string]$Destination,
  [int]$MaximumPartMB = 7
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$Source = [IO.Path]::GetFullPath($Source)
$Destination = [IO.Path]::GetFullPath($Destination)
if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) { throw "Source ZIP not found: $Source" }
if (Test-Path -LiteralPath $Destination) { throw "Destination already exists: $Destination" }
if ($MaximumPartMB -lt 1) { throw 'MaximumPartMB must be at least 1' }
New-Item -ItemType Directory -Path $Destination -ErrorAction Stop | Out-Null
$original = [IO.Compression.ZipFile]::OpenRead($Source)
$limit = $MaximumPartMB * 1MB
$expected = @{}
$outputs = [Collections.Generic.List[string]]::new()
function Hash-Entry($entry) {
  $inputStream = $entry.Open()
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($hasher.ComputeHash($inputStream))).Replace('-', '') }
  finally { $inputStream.Dispose(); $hasher.Dispose() }
}
try {
  $categories = [ordered]@{ '01-dependencies'=@(); '02-app-server'=@(); '03-static-assets'=@(); '04-public-assets'=@(); '05-database'=@(); '06-startup'=@() }
  foreach ($entry in $original.Entries) {
    $name = $entry.FullName
    if ($name -match '(^|/)\.env($|\.)' -or $name.Contains('\') -or $name -match '(^|/)\.\.(/|$)' -or $name.StartsWith('/')) { throw "Unsafe archive entry: $name" }
    if ($expected.ContainsKey($name)) { throw "Duplicate source entry: $name" }
    $expected[$name] = Hash-Entry $entry
    $category = if ($name.StartsWith('node_modules/') -or $name.StartsWith('.next/node_modules/')) { '01-dependencies' }
      elseif ($name.StartsWith('.next/static/')) { '03-static-assets' }
      elseif ($name.StartsWith('.next/')) { '02-app-server' }
      elseif ($name.StartsWith('public/')) { '04-public-assets' }
      elseif ($name.StartsWith('prisma/')) { '05-database' }
      else { '06-startup' }
    $categories[$category] += $entry
  }
  foreach ($category in $categories.Keys) {
    $part = 0; $bytes = 0; $archive = $null
    try {
      foreach ($entry in ($categories[$category] | Sort-Object FullName)) {
        if ($null -eq $archive -or $bytes + $entry.CompressedLength + 1024 -gt $limit) {
          if ($null -ne $archive) { $archive.Dispose() }
          $part++; $bytes = 0
          $path = Join-Path $Destination ('{0}-{1:D2}.zip' -f $category,$part)
          $archive = [IO.Compression.ZipFile]::Open($path,[IO.Compression.ZipArchiveMode]::Create)
          $outputs.Add($path)
        }
        $copy = $archive.CreateEntry($entry.FullName,[IO.Compression.CompressionLevel]::Optimal)
        $copy.LastWriteTime = $entry.LastWriteTime
        $inputStream = $entry.Open(); $outputStream = $copy.Open()
        try { $inputStream.CopyTo($outputStream) } finally { $inputStream.Dispose(); $outputStream.Dispose() }
        $bytes += $entry.CompressedLength + 1024
      }
    } finally { if ($null -ne $archive) { $archive.Dispose() } }
  }
} finally { $original.Dispose() }
$verified = @{}
foreach ($path in $outputs) {
  $archive = [IO.Compression.ZipFile]::OpenRead($path)
  try {
    foreach ($entry in $archive.Entries) {
      if ($verified.ContainsKey($entry.FullName)) { throw 'Duplicate output entry' }
      if ((Hash-Entry $entry) -ne $expected[$entry.FullName]) { throw "Changed content: $($entry.FullName)" }
      $verified[$entry.FullName] = $true
    }
  } finally { $archive.Dispose() }
  '{0}: {1:N2} MB' -f [IO.Path]::GetFileName($path),((Get-Item -LiteralPath $path).Length / 1MB)
}
if ($verified.Count -ne $expected.Count) { throw 'Incomplete output' }
"Verified all $($verified.Count) entries against the original ZIP; $($outputs.Count) independent ZIP files."
