"""
AI Inference Server — FastAPI
Endpoint: POST /predict
  - Nhận ảnh từ Node.js backend (multipart/form-data)
  - Chạy YOLO Pose qua predictor.py
  - Trả về JSON kết quả mức ngập
"""

import os
import uuid
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import uvicorn

# ── Import predictor ───────────────────────────────────────────────
from predictor import PosePredictor

# ── Khởi tạo model 1 lần khi server start ─────────────────────────
BASE_DIR   = Path(__file__).parent          # thư mục ai_inferences/
WEIGHTS    = BASE_DIR / "weights" / "best_train3.pt"
TMP_DIR    = BASE_DIR / "tmp"
TMP_DIR.mkdir(exist_ok=True)

predictor = PosePredictor(model_path=str(WEIGHTS))

app = FastAPI(
    title="Flood AI Inference Service",
    version="1.0.0",
    description="YOLO Pose — Phát hiện mức ngập từ ảnh biển báo"
)

# ── Health check ───────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": predictor.model is not None,
        "weights": str(WEIGHTS)
    }

# ── Predict endpoint ───────────────────────────────────────────────
@app.post("/predict")
async def predict(image: UploadFile = File(...)):
    """
    Nhận file ảnh → chạy AI → trả về:
    {
      "success": true/false,
      "label": "SAFE"|"HIGH"|"DEEP"|"DANGEROUS"|"UNDETECTED",
      "floodLevel": <cm>,
      "score": <0-1>,
      "warnable": true/false,   // true nếu flood >= 10cm (đủ để cảnh báo)
      "message": "..."
    }
    """
    # Validate file type
    if not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File phải là ảnh (jpg/png/jpeg)")

    # Lưu ảnh tạm vào tmp/
    job_id      = uuid.uuid4().hex
    input_path  = str(TMP_DIR / f"{job_id}_input.jpg")
    output_path = str(TMP_DIR / f"{job_id}_output.jpg")

    try:
        # Ghi ảnh nhận được xuống disk
        with open(input_path, "wb") as f:
            content = await image.read()
            f.write(content)

        # Chạy AI
        result = predictor.process_image(input_path, output_path)

        # ── Phân tích kết quả ──────────────────────────────────────
        if result is False:
            # Confidence < 0.2: không nhận diện được biển báo
            return JSONResponse({
                "success": False,
                "label": "UNDETECTED",
                "floodLevel": None,
                "score": None,
                "warnable": False,
                "message": "Không phát hiện được biển báo ngập trong ảnh"
            })

        if isinstance(result, str):
            # "NO_MODEL" hoặc "ERROR_AI"
            return JSONResponse({
                "success": False,
                "label": result,
                "floodLevel": None,
                "score": None,
                "warnable": False,
                "message": f"Lỗi AI: {result}"
            }, status_code=500)

        # Thành công: result = (label, flood_level_cm, score)
        label, flood_level, score = result

        # Warnable: mức ngập >= 10 cm → đủ để cảnh báo, tự động duyệt
        warnable = (flood_level is not None and flood_level >= 10)

        return JSONResponse({
            "success": True,
            "label": label,
            "floodLevel": round(float(flood_level), 1) if flood_level is not None else None,
            "score": round(float(score), 4),
            "warnable": warnable,
            "message": _build_message(label, flood_level)
        })

    except Exception as e:
        return JSONResponse({
            "success": False,
            "label": "ERROR_AI",
            "floodLevel": None,
            "score": None,
            "warnable": False,
            "message": str(e)
        }, status_code=500)

    finally:
        # Dọn file tạm
        for p in [input_path, output_path]:
            try:
                if os.path.exists(p):
                    os.remove(p)
            except:
                pass


def _build_message(label: str, flood_level: float) -> str:
    if label == "SAFE":
        return f"Mức ngập thấp ({flood_level:.0f} cm) — không đủ để cảnh báo"
    elif label == "HIGH":
        return f"Mức ngập trung bình ({flood_level:.0f} cm) — cần lưu ý"
    elif label == "DEEP":
        return f"Mức ngập cao ({flood_level:.0f} cm) — cảnh báo"
    elif label == "DANGEROUS":
        return f"Mức ngập nguy hiểm ({flood_level:.0f} cm) — cảnh báo khẩn cấp"
    return "Không xác định"


# ── Run ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import os
    # HuggingFace Spaces yêu cầu port 7860
    # VPS/local dùng port 8000
    PORT = int(os.environ.get("PORT", 7860))
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=PORT,
        reload=False,
        workers=1          # YOLO không thread-safe → dùng 1 worker
    )
