# VCFM local preview — one server on 127.0.0.1:8765
# Run: pwsh -File start-local.ps1   (or right-click → Run with PowerShell)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$port = 8765
$url = "http://127.0.0.1:$port/"

Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  $procId = $_.OwningProcess
  if ($procId -and $procId -ne 0) {
    Write-Host "Stopping old PID $procId on $port ..."
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 400
  }
}

Write-Host ""
Write-Host "  VCFM local preview"
Write-Host "  $url"
Write-Host "  Stop with Ctrl+C"
Write-Host ""

Start-Process $url

$env:VCFM_ROOT = $PSScriptRoot
python -c @'
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os
root = os.environ.get("VCFM_ROOT") or os.getcwd()
os.chdir(root)
class H(SimpleHTTPRequestHandler):
    extensions_map = dict(getattr(SimpleHTTPRequestHandler, "extensions_map", {}))
    extensions_map.update({
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
    })
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()
print("Serving http://127.0.0.1:8765/", flush=True)
ThreadingHTTPServer(("127.0.0.1", 8765), H).serve_forever()
'@
