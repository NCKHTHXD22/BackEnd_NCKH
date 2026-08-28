#!/usr/bin/env bash
# Runs ON the VPS (uploaded and executed by .github/workflows/deploy-xgb-vps.yml).
# Syncs /root/app to origin/main and rebuilds the XGBoost Docker container on port 8001.
set -e

cd /root/app

git fetch origin main

# Safety net: never overwrite work that only exists on the VPS.
if [ -n "$(git status --porcelain)" ]; then
  echo "::error::VPS repo has uncommitted local changes — refusing to deploy. Reconcile manually."
  exit 1
fi
if ! git merge-base --is-ancestor HEAD origin/main; then
  echo "::error::VPS HEAD has commits not on origin/main — refusing to deploy. Reconcile manually."
  exit 1
fi

git reset --hard origin/main
echo "Deployed commit: $(git rev-parse --short HEAD)"

cd XGBoost_Py_Backend

# Ensure .env exists (copy from LSTM service or root if needed)
if [ ! -f .env ]; then
  if [ -f ../LSTM_Py_Backend/lstm_service/.env ]; then
    cp ../LSTM_Py_Backend/lstm_service/.env .env
  elif [ -f ../.env ]; then
    cp ../.env .env
  else
    touch .env
  fi
fi

# If artifacts/xgb is missing but zip is present, extract it
if [ ! -d artifacts/xgb ] && [ -f result_xgboots.zip ]; then
  echo "Extracting result_xgboots.zip on VPS..."
  unzip -q -o result_xgboots.zip -d .
fi


docker build -t xgb-api:latest .
docker stop xgb-container >/dev/null 2>&1 || true
docker rm xgb-container >/dev/null 2>&1 || true
docker run -d -p 8001:8001 --name xgb-container --restart always --env-file .env xgb-api:latest

echo "Waiting for XGBoost service to come up..."
sleep 8
curl -sf http://localhost:8001/health || (echo "::error::XGBoost health check failed after deploy" && exit 1)
echo "XGBoost service healthy."
