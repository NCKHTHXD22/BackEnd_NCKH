import json
import urllib.request

url = "http://127.0.0.1:8000/optimize"
data = {
    "reservoir_id": 1,
    "current_water_level": 375.0,
    "current_inflow": 800.0,
    "downstream_limit": 1000.0
}
req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers={"Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req) as res:
        print("Status:", res.status)
        print(res.read().decode("utf-8"))
except Exception as e:
    print("Error:", e)
    if hasattr(e, "read"):
        print(e.read().decode("utf-8"))
