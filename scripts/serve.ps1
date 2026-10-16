# Tiny static file server for local preview (no Node or Python needed).
#   powershell -ExecutionPolicy Bypass -File scripts/serve.ps1 [-Port 8080]
# Dev-only extra: POST /__save/<name>.json writes the body into geo/ (used by
# tools/build-map.html to save the built map). Listens on localhost only.
param([int]$Port = 8080)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$types = @{
  ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"; ".css" = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"; ".geojson" = "application/geo+json"; ".csv" = "text/csv; charset=utf-8"
  ".md" = "text/plain; charset=utf-8"; ".svg" = "image/svg+xml"; ".png" = "image/png"; ".ico" = "image/x-icon"
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request; $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($req.HttpMethod -eq "POST" -and $path -match '^/__save/([a-z0-9._-]+\.json)$') {
      $dest = Join-Path $root "geo/$($Matches[1])"
      $fs = [System.IO.File]::Create($dest)
      $req.InputStream.CopyTo($fs); $fs.Close()
      $res.StatusCode = 204
    } else {
      if ($path.EndsWith("/")) { $path += "index.html" }
      $file = [System.IO.Path]::GetFullPath((Join-Path $root $path.TrimStart("/")))
      if (-not $file.StartsWith($root.Path) -or -not (Test-Path $file -PathType Leaf)) {
        $res.StatusCode = 404
      } else {
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        $res.ContentType = $(if ($types[$ext]) { $types[$ext] } else { "application/octet-stream" })
        $res.Headers.Add("Cache-Control", "no-store")
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      }
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.Close()
  }
}
