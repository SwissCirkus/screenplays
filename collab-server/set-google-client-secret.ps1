# Puts the Google sign-in client's secret into Google Secret Manager (screenplays-google-client-secret), so the co-writing server
# can keep people connected to Google Drive (services/driveTokens.ts). You paste the secret here; it goes straight to Google and is
# not shown, saved to a file or kept in the shell history. Then run the deploy again.
#
#   powershell -ExecutionPolicy Bypass -File set-google-client-secret.ps1
#
# Where the secret is: Google Cloud Console -> project gen-lang-client-0166746144 -> Google Auth Platform -> Clients ->
# the Web client 137075271992-st7deo4q3m0pptfo02ep31638bj07tor -> Client secrets (add one if none is shown).
$ErrorActionPreference = 'Stop'
$project = 'gen-lang-client-0166746144'
$name = 'screenplays-google-client-secret'

$secure = Read-Host -AsSecureString 'Paste the Google client secret (it will not show), then press Enter'
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if (-not $plain -or $plain.Trim().Length -lt 10) { Write-Host 'Nothing pasted - nothing changed.'; exit 1 }
$tmp = New-TemporaryFile
try {
  [IO.File]::WriteAllText($tmp, $plain.Trim())
  $exists = $true
  try { gcloud secrets describe $name --project $project *> $null; if ($LASTEXITCODE -ne 0) { $exists = $false } } catch { $exists = $false }
  if ($exists) { gcloud secrets versions add $name --data-file="$tmp" --project $project --quiet }
  else { gcloud secrets create $name --data-file="$tmp" --replication-policy=automatic --project $project --quiet }
  if ($LASTEXITCODE -ne 0) { throw 'gcloud could not save it' }
  Write-Host "Saved as $name. Now deploy the co-writing server again."
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  $plain = $null
}
