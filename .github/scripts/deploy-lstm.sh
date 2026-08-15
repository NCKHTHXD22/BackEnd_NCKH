#!/usr/bin/env bash
# Runs ON the VPS (uploaded and executed by .github/workflows/deploy-lstm-vps.yml).
# Syncs /root/app to origin/main and rebuilds the LSTM Docker container.
set -e

cd /root/app

git fetch origin main

# Safety net: never overwrite work that only exists on the VPS.
# If this fires, someone made local edits on the server again —
# deploy manually after reconciling instead of trusting this job.
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

cd LSTM_Py_Backend/lstm_service
docker build -t lstm-api:latest .
docker stop lstm-container >/dev/null 2>&1 || true
docker rm lstm-container >/dev/null 2>&1 || true
docker run -d -p 8000:7860 --name lstm-container --restart always --env-file .env lstm-api:latest

echo "Waiting for service to come up..."
sleep 8
curl -sf http://localhost:8000/health || (echo "::error::Health check failed after deploy" && exit 1)
echo "LSTM service healthy."
