param([switch]$SkipCovers)
$ErrorActionPreference = 'Stop'
function Get-ContentSha256([string]$FilePath) {
  $inputStream = [IO.File]::OpenRead($FilePath)
  $digest = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($digest.ComputeHash($inputStream)).Replace('-','').ToLower() }
  finally { $inputStream.Dispose(); $digest.Dispose() }
}
$projectDir = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $projectDir 'extension/manifest.json') -Encoding utf8 -Raw | ConvertFrom-Json
$name = 'MiorningTextFloat-v' + $manifest.version
$dist = Join-Path $projectDir 'dist'
$staging = Join-Path $dist $name
New-Item -ItemType Directory -Force -Path $staging | Out-Null
foreach ($directory in @('extension','scripts','docs')) {
  Copy-Item -LiteralPath (Join-Path $projectDir $directory) -Destination $staging -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $staging 'qa') | Out-Null
Get-ChildItem -LiteralPath (Join-Path $projectDir 'qa') -File | Where-Object {$_.Extension -in @('.cjs','.html')} | Copy-Item -Destination (Join-Path $staging 'qa') -Force
foreach ($file in @('README.md','README.en.md','LICENSE','NOTICE.md','THIRD_PARTY_NOTICES.md','SOURCE.md','RELEASE-NOTES.md','package.json','package-lock.json')) {
  Copy-Item -LiteralPath (Join-Path $projectDir $file) -Destination $staging -Force
}
$preview = Get-Content -LiteralPath (Join-Path $projectDir 'qa/fixture.html') -Encoding utf8 -Raw
$logo = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $projectDir 'extension/icons/48.png')))
$preview = $preview.Replace('<title>', ('<meta name="miorning-logo" content="data:image/png;base64,' + $logo + '"><title>'))
$dockLogo = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $projectDir 'extension/icons/128.png')))
$preview = $preview.Replace('<title>', ('<meta name="miorning-dock-logo" content="data:image/png;base64,' + $dockLogo + '"><title>'))
$preview = $preview.Replace('<title>', '<meta name="miorning-options" content="extension/options.html"><title>')
$runtime = @('control.js','store.js','shell.js','references.js','menus.js','dock.js','editing.js','compat.js','content.js') | ForEach-Object { '<script>' + [Environment]::NewLine + (Get-Content -LiteralPath (Join-Path $projectDir ('extension/' + $_)) -Encoding utf8 -Raw) + [Environment]::NewLine + '</script>' }
$preview = $preview.Replace('</html>', (($runtime -join [Environment]::NewLine) + '</html>'))
[IO.File]::WriteAllText((Join-Path $staging 'preview.html'), $preview, [Text.UTF8Encoding]::new($false))
$installer = Join-Path $dist ($name + '.zip')
Compress-Archive -LiteralPath $staging -DestinationPath $installer -Force
$covers = Join-Path $projectDir 'covers'
$archives = @($installer)
if (!$SkipCovers -and (Test-Path -LiteralPath $covers)) {
  $coverZip = Join-Path $dist ($name + '-covers.zip')
  Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath $covers -File).FullName -DestinationPath $coverZip -Force
  $archives += $coverZip
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
foreach ($archivePath in $archives) {
  $archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
  try {
    foreach ($entry in $archive.Entries | Where-Object {$_.Length -gt 0}) {
      $relative = $entry.FullName.Replace('\','/')
      $source = if ($archivePath -eq $installer) {Join-Path $dist $relative} else {Join-Path $covers $relative}
      $stream = $entry.Open()
      $sha = [Security.Cryptography.SHA256]::Create()
      try {$actual=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','')} finally {$stream.Dispose();$sha.Dispose()}
      if ($actual.ToLower() -ne (Get-ContentSha256 $source)) {throw ('Archive mismatch: '+$relative)}
    }
  } finally {$archive.Dispose()}
}
$checksums = foreach ($file in $archives) { (Get-ContentSha256 $file) + '  ' + (Split-Path -Leaf $file) }
[IO.File]::WriteAllText((Join-Path $dist 'SHA256SUMS.txt'), ($checksums -join "`n") + "`n", [Text.UTF8Encoding]::new($false))
$checksums
