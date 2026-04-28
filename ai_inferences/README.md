---
title: Flood AI Inference
emoji: 🌊
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
app_port: 7860
---

# Flood AI Inference Service

YOLO Pose model để phát hiện và tính mức ngập lụt từ ảnh biển báo.

## Endpoint

- `GET /health` — Kiểm tra trạng thái server và model
- `POST /predict` — Nhận ảnh, trả về mức ngập (cm)

## Sử dụng

```bash
curl -X POST https://<your-space-url>/predict \
  -F "image=@flood_image.jpg"
```
