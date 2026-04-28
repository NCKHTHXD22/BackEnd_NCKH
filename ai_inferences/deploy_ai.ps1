$SERVER_IP   = "103.107.182.191"
$SERVER_USER = "ubuntu"
$SERVER_PATH = "/home/ubuntu/ai_inferences"
$LOCAL_PATH  = "ai_inferences"

# ── Buoc 1: Upload files ───────────────────────────────────────────
Write-Host "[1/5] Upload code len server..." -ForegroundColor Cyan

$TempDir = "$env:TEMP\ai_deploy_$(Get-Random)"
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
New-Item -ItemType Directory -Path "$TempDir\weights" -Force | Out-Null
New-Item -ItemType Directory -Path "$TempDir\tmp" -Force | Out-Null

Copy-Item "$LOCAL_PATH\predictor.py"     "$TempDir\"
Copy-Item "$LOCAL_PATH\server.py"        "$TempDir\"
Copy-Item "$LOCAL_PATH\requirements.txt" "$TempDir\"
Copy-Item "$LOCAL_PATH\flood-ai.service" "$TempDir\"
Copy-Item "$LOCAL_PATH\weights\best_train3.pt" "$TempDir\weights\"

# Tao thu muc tren server truoc
ssh "${SERVER_USER}@${SERVER_IP}" "mkdir -p $SERVER_PATH/weights $SERVER_PATH/tmp"

scp "$TempDir\predictor.py"             "${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/"
scp "$TempDir\server.py"                "${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/"
scp "$TempDir\requirements.txt"         "${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/"
scp "$TempDir\flood-ai.service"         "${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/"
scp "$TempDir\weights\best_train3.pt"   "${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/weights/"

Remove-Item -Recurse -Force $TempDir
Write-Host "  OK Upload xong!" -ForegroundColor Green

# ── Buoc 2: Cai Python venv + packages ────────────────────────────
Write-Host "[2/5] Cai virtual environment va packages..." -ForegroundColor Cyan
ssh "${SERVER_USER}@${SERVER_IP}" "cd $SERVER_PATH && python3 -m venv .venv && .venv/bin/pip install --upgrade pip -q && .venv/bin/pip install -r requirements.txt"
Write-Host "  OK Packages da cai xong!" -ForegroundColor Green

# ── Buoc 3: Cai systemd service ───────────────────────────────────
Write-Host "[3/5] Cai systemd service..." -ForegroundColor Cyan
ssh "${SERVER_USER}@${SERVER_IP}" "sudo cp $SERVER_PATH/flood-ai.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable flood-ai"
Write-Host "  OK Service da dang ky!" -ForegroundColor Green

# ── Buoc 4: Start service ─────────────────────────────────────────
Write-Host "[4/5] Khoi dong service..." -ForegroundColor Cyan
ssh "${SERVER_USER}@${SERVER_IP}" "sudo systemctl restart flood-ai && sleep 3 && sudo systemctl status flood-ai --no-pager"

# ── Buoc 5: Health check ──────────────────────────────────────────
Write-Host "[5/5] Kiem tra health check..." -ForegroundColor Cyan
Start-Sleep -Seconds 4
try {
    $r = Invoke-RestMethod -Uri "http://${SERVER_IP}:8000/health" -TimeoutSec 15
    Write-Host "  OK Server ONLINE!" -ForegroundColor Green
    Write-Host "     model_loaded = $($r.model_loaded)"
    Write-Host "     weights      = $($r.weights)"
} catch {
    Write-Host "  WARN: $_" -ForegroundColor Yellow
    Write-Host "  Hay kiem tra: sudo ufw allow 8000/tcp tren server" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Deploy hoan tat!" -ForegroundColor Green
Write-Host "  Endpoint : http://${SERVER_IP}:8000/predict" -ForegroundColor Cyan
Write-Host "  Health   : http://${SERVER_IP}:8000/health"  -ForegroundColor Cyan
