$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputFolder = Join-Path $projectRoot 'outputs'
New-Item -ItemType Directory -Path $outputFolder -Force | Out-Null
$zipPath = Join-Path $outputFolder ('digisoft-school-pro-cpanel-source-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip')
$sourceFolders = @('app', 'components', 'contexts', 'hooks', 'lib', 'types', 'public')
$rootFiles = @('package.json', 'package-lock.json', 'app.cjs', 'next.config.ts', 'tsconfig.json', 'next-env.d.ts', 'postcss.config.mjs', 'auth.ts', 'auth.config.ts', 'proxy.ts', 'components.json', '.env.example')
$sourceFiles = @()
foreach ($folder in $sourceFolders) {
    $sourceFiles += Get-ChildItem -LiteralPath (Join-Path $projectRoot $folder) -File -Recurse |
        Where-Object { $_.FullName -notlike (Join-Path $projectRoot 'public\uploads\*') -and $_.Name -notmatch '\.(test|spec)\.' }
}
foreach ($relative in $rootFiles) {
    $sourceFiles += Get-Item -LiteralPath (Join-Path $projectRoot $relative)
}
$sourceFiles += Get-Item -LiteralPath (Join-Path $projectRoot 'prisma/schema.prisma')
$sourceFiles += Get-Item -LiteralPath (Join-Path $projectRoot 'prisma/seed.ts')
$sourceFiles += Get-ChildItem -LiteralPath (Join-Path $projectRoot 'prisma/migrations') -File -Recurse
$sourceFiles += Get-Item -LiteralPath (Join-Path $projectRoot 'documentation/cpanel-deployment.md')
$sourceFiles = @($sourceFiles | Sort-Object FullName -Unique)
$archive = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
    foreach ($file in $sourceFiles) {
        $relative = $file.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $relative, 'Optimal') | Out-Null
    }
} finally {
    $archive.Dispose()
}
$verify = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $names = @($verify.Entries | ForEach-Object { $_.FullName })
    if ($names | Where-Object { $_ -match '(^|/)(node_modules|\.git|\.next|uploads)/|(^|/)\.env(?!\.example$)|\.(gz|bak)$' -or ($_ -match '\.sql$' -and $_ -notmatch '^prisma/migrations/[^/]+/migration\.sql$') }) {
        throw 'Unexpected private or generated file in deployment archive.'
    }
    foreach ($required in @('app.cjs', 'package.json', 'package-lock.json', 'prisma/schema.prisma', 'documentation/cpanel-deployment.md')) {
        if ($names -notcontains $required) { throw "Missing required file: $required" }
    }
    Write-Output "Verified $($names.Count) source files. Secrets, uploaded user files and build output excluded."
} finally {
    $verify.Dispose()
}
Get-Item -LiteralPath $zipPath | Select-Object FullName, Length
