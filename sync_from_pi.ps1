param (
    [string] = "10.176.219.19"
)

Write-Host "
📡 Syncing field outputs from Raspberry Pi ()..." -ForegroundColor Cyan
scp -o StrictHostKeyChecking=no -r "pi@:~/microplastic-detection-IMSE/outputs/field_results" "outputs/"
scp -o StrictHostKeyChecking=no -r "pi@:~/microplastic-detection-IMSE/outputs/reports" "outputs/"
Write-Host "✅ Sync complete! Your laptop outputs/ folder is now 100% up to date with the Pi." -ForegroundColor Green
