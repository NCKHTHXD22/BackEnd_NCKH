---
title: LSTM Inflow Prediction API
emoji: 🌊
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
license: mit
---

# LSTM Inflow Prediction API

FastAPI service cung cấp dự báo lưu lượng đến (inflow) cho 16 hồ chứa thủy điện thành phố Đà Nẵng.

## Endpoint

### `GET /health`
Kiểm tra trạng thái server.

### `POST /predict`
Dự báo 12 giờ tới cho một hồ chứa.

**Request body:**
```json
{ "rid": 1 }
```

**Response:**
```json
{
  "reservoirId": 1,
  "reservoirName": "HO A VUONG",
  "referenceTime": "2026-03-28T19:00:00",
  "modelUsed": "fine_tuned_rid_0",
  "predictions": [
    { "targetTime": "2026-03-28T20:00:00", "p10": 45.2, "p50": 68.5, "p90": 102.1 },
    ...
  ]
}
```

## Reservoir IDs
| ID | Tên hồ |
|----|--------|
| 1 | Hồ A Vương |
| 2 | Hồ Đắk Mi 4 |
| 3 | Hồ Sông Bung 4 |
| 4 | Hồ Sông Tranh 2 |
| 7 | Hồ Sông Bung 4A |
| 8 | Hồ Sông Bung 5 |
| 9 | Hồ Sông Bung 2 |
| 11 | Hồ Sông Bung 6 |
| 12 | Hồ Sông Tranh 3 |
| 13 | Hồ Zà Hưng |
| 14 | Hồ Đắk Mi 3 |
| 15 | Hồ Khê Diện |
| 16 | Hồ Sông Con 2 |
| 17 | Hồ Sông Tranh 4 |
| 18 | Hồ Đắk Mi 2 |
| 19 | Hồ Đắk Mi 4C |
