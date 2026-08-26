# XGBoost_Py_Backend

XGBoost cho dự báo lưu lượng đến (Qvào) — mô hình thứ 3 song song với
`LSTM_Py_Backend/` và `RF_Py_Backend/`, **tự chứa cả train + serve** (giống
cấu trúc `LSTM_Py_Backend/lstm_service/`), phục vụ Node.js layer `XGBoots/`
(`forecast_XGB` collection).

## Kiến trúc — tự chứa, KHÔNG dùng chung container với LSTM

```
XGBoost_Py_Backend/  (port 8001)          RF_Py_Backend/  (port 8002)
  main_api.py  POST /predict-xgb            main_api.py  POST /predict-rf
        │                                          │
        ▼                                          ▼
  src/jobs/xgbForecast.job.js            src/jobs/rfForecast.job.js
  (Node cron, gọi XGB_API_URL)           (Node cron, gọi RF_API_URL)
        │                                          │
        ▼                                          ▼
  MongoDB forecast_XGB  ──> XGBoots/       MongoDB forecast_RF ──> ForecastRF/
```

Ban đầu `/predict-xgb` từng nằm chung container với LSTM
(`LSTM_Py_Backend/lstm_service/main_api.py`) để đỡ tốn tài nguyên VPS — đã
**chuyển hẳn sang đây** để giống cấu trúc tự chứa của LSTM (1 model = 1 thư
mục = 1 service độc lập, dễ deploy/debug riêng). XGBoost/RF không dùng
PyTorch nên container rất nhẹ (không tốn nhiều tài nguyên như lo ngại ban đầu).

Training trước đây nằm trong `LSTM_Py_Backend/lstm_service/training/train_xgb.py`
(dùng Excel gốc qua `data/dataset_builder.py`) — đã chuyển hẳn sang đây, đọc
dữ liệu từ `LSTM_Py_Backend_v2/datasets/` (đã build sẵn, backup trên Hugging
Face `Anvo2004/dataset_all_lake`).

## Thiết kế mô hình

Xem `RF_Py_Backend/README.md` — cùng logic (global model, direct
multi-horizon, không dùng mưa dự báo oracle, fixed-date split), chỉ khác thuật
toán: 72 booster XGBoost (`objective="reg:quantileerror"`, 1 booster/quantile/
horizon) thay vì Quantile Regression Forest.

## Chạy local

```bash
pip install -r requirements.txt
python main_train.py       # -> artifacts/xgb/h01_q10.json .. h24_q90.json (72 file)
python main_evaluate.py    # -> ket_qua_danh_gia_2025_xgb.xlsx, ket_qua_nse_theo_gio_xgb.xlsx
python main_api.py         # -> serve tại http://localhost:8001 (POST /predict-xgb, GET /health)
```

## Chạy trên Kaggle (train)

```bash
python kaggle/generate_notebook.py   # -> kaggle/train_xgb.ipynb
```
Upload lên Kaggle, **không cần bật GPU**. Không cần attach Dataset — tự tải từ
Hugging Face `Anvo2004/dataset_all_lake` nếu không thấy `/kaggle/input`.

## Deploy serving (VPS)

```bash
docker build -t xgboost-api .
docker run -d --restart always -p 8001:8001 --name xgboost-container xgboost-api
```
Node backend cần biến môi trường `XGB_API_URL=http://<vps-ip>:8001/predict-xgb`
(mặc định trong `src/jobs/xgbForecast.job.js` đã trỏ tới `103.107.182.191:8001`).

## Sau khi train xong

Copy `artifacts/xgb/` (72 file `.json`, nhẹ) vào đây rồi commit vào git —
`main_api.py` load trực tiếp từ đây lúc serving, không cần copy sang chỗ khác
nữa (khác với thiết kế cũ khi còn dùng chung container LSTM).
