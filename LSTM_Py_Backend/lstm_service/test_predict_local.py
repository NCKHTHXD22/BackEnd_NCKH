import requests
import json
from datetime import datetime

url = "http://localhost:7860/predict"
payload = {"rid": 1} # A Vương

print(f"🚀 Sending prediction request to {url} for Reservoir {payload['rid']}...")

try:
    response = requests.post(url, json=payload, timeout=180)
    if response.status_code == 200:
        data = response.json()
        print("\n✅ PREDICTION SUCCESSFUL!")
        print(f"🏔 Reservoir: {data['reservoirName']} (ID: {data['reservoirId']})")
        print(f"🕒 Reference Time: {data['referenceTime']}")
        print(f"🧠 Model used: {data['modelUsed']}")
        
        print("\n📈 Forecast results (Next 12 hours):")
        print(f"{'Target Time':<25} | {'p10':<8} | {'p50':<8} | {'p90':<8}")
        print("-" * 55)
        for p in data['predictions']:
            print(f"{p['targetTime']:<25} | {p['p10']:<8} | {p['p50']:<8} | {p['p90']:<8}")
            
    else:
        print(f"❌ FAILED: {response.status_code}")
        print(response.text)
except Exception as e:
    print(f"❌ Error during request: {e}")
