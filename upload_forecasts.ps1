$ErrorActionPreference = "Continue"
$baseUrl = "https://backend-nckh-lm57.onrender.com/api/forecast-history"
$folder = "$env:LOCALAPPDATA\VuGiaThuBonDSS\ForecastHistory"
$files = Get-ChildItem "$folder\*.json"

Write-Host "📤 Upload $($files.Count) files to MongoDB..." -ForegroundColor Cyan
$totalUploaded = 0
$totalErrors = 0

foreach ($file in $files) {
    Write-Host "`n📁 $($file.Name) ($([math]::Round($file.Length/1024, 1)) KB)" -ForegroundColor Yellow
    
    try {
        $json = Get-Content $file.FullName -Raw
        $items = $json | ConvertFrom-Json
        
        if ($items.Count -eq 0) {
            Write-Host "   ⚠ Empty file, skipping" -ForegroundColor DarkYellow
            continue
        }
        
        # Upload in batches of 200
        $batchSize = 200
        for ($i = 0; $i -lt $items.Count; $i += $batchSize) {
            $batch = $items[$i..[math]::Min($i + $batchSize - 1, $items.Count - 1)]
            $batchJson = $batch | ConvertTo-Json -Depth 10 -Compress
            
            # Ensure it's always an array
            if ($batch.Count -eq 1) { $batchJson = "[$batchJson]" }
            
            $response = Invoke-RestMethod -Uri $baseUrl -Method Post -Body $batchJson -ContentType "application/json; charset=utf-8" -TimeoutSec 60
            $totalUploaded += ($response.upserted + $response.modified)
            Write-Host "   ✅ Batch $([math]::Floor($i/$batchSize)+1): $($response.upserted) new, $($response.modified) updated" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
        $totalErrors++
    }
}

Write-Host "`n✅ Done! Total uploaded: $totalUploaded, Errors: $totalErrors" -ForegroundColor Cyan
