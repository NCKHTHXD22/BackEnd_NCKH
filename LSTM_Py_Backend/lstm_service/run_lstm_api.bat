@echo off
echo =======================================================
echo Starting LSTM Inflow Prediction API on port 8000...
echo =======================================================

cd /d "%~dp0"
python main_api.py

pause
