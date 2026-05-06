#!/bin/bash
# ================================================================
# deploy_ai.sh — Deploy AI Inference Service lên VPS
# Chạy trên MÁY CỦA BẠN, không phải server
#
# Cách dùng:
#   chmod +x deploy_ai.sh
#   ./deploy_ai.sh
# ================================================================

set -e

SERVER_IP="103.107.182.191"
SERVER_USER="ubuntu"          # đổi nếu user khác (root, vu, ...)
SERVER_PATH="/home/ubuntu/ai_inferences"
LOCAL_PATH="./ai_inferences"  # chạy từ thư mục gốc dự án

echo "🚀 [1/5] Upload code lên server..."
rsync -avz --progress \
  --exclude "__pycache__" \
  --exclude "tmp/" \
  --exclude ".venv/" \
  "$LOCAL_PATH/" \
  "${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/"

echo "⚙️  [2/5] Tạo virtual environment & cài packages..."
ssh "${SERVER_USER}@${SERVER_IP}" bash << 'EOF'
cd /home/ubuntu/ai_inferences

# Tạo venv nếu chưa có
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
  echo "✅ Virtual env created"
fi

# Cài packages
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
echo "✅ Dependencies installed"
EOF

echo "🔧 [3/5] Cài systemd service..."
ssh "${SERVER_USER}@${SERVER_IP}" bash << 'EOF'
sudo cp /home/ubuntu/ai_inferences/flood-ai.service /etc/systemd/system/flood-ai.service
sudo systemctl daemon-reload
sudo systemctl enable flood-ai
echo "✅ Service registered"
EOF

echo "🔄 [4/5] Khởi động lại service..."
ssh "${SERVER_USER}@${SERVER_IP}" bash << 'EOF'
sudo systemctl restart flood-ai
sleep 3
sudo systemctl status flood-ai --no-pager
EOF

echo "✅ [5/5] Kiểm tra health check..."
sleep 2
curl -s "http://${SERVER_IP}:8000/health" | python3 -m json.tool || echo "⚠️  Không kết nối được — kiểm tra firewall port 8000"

echo ""
echo "🎉 Deploy xong! Endpoint: http://${SERVER_IP}:8000/predict"
