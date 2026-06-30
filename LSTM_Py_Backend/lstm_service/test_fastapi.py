from fastapi.testclient import TestClient
from main_api import app

client = TestClient(app)
response = client.post("/optimize", json={
    "reservoir_id": 1,
    "current_water_level": 375.0,
    "current_inflow": 800.0,
    "downstream_limit": 1000.0
})
print("Status:", response.status_code)
print("Response:", response.json())
