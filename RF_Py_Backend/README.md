# RF_Py_Backend

Random Forest (Quantile Regression Forest) cho dự báo lưu lượng đến (Qvào) —
mô hình thứ 3 song song với `LSTM_Py_Backend/` và `XGBoost_Py_Backend/`, **tự
chứa cả train + serve** (giống cấu trúc `LSTM_Py_Backend/lstm_service/`),
phục vụ Node.js layer `ForecastRF/` (`forecast_RF` collection).

## Kiến trúc — tự chứa, service riêng (port 8002)

`main_api.py` (FastAPI, `POST /predict-rf`) chạy container/service độc lập —
KHÔNG dùng chung với LSTM hay XGBoost. `src/jobs/rfForecast.job.js` (Node
cron) gọi endpoint này mỗi giờ, ghi kết quả vào MongoDB `forecast_RF`, rồi
`ForecastRF/` (Express routes) trả về cho frontend. Xem
`XGBoost_Py_Backend/README.md` để có sơ đồ đầy đủ 3 model.

## Vì sao thư mục này tồn tại

`LSTM_Project/Data_Tung_Ho_Ma_Tran_Rong/` (Excel gốc) đã bị xoá khỏi máy local
(2026-08-26). Thay vì phụ thuộc lại Excel, thư mục này lấy dữ liệu trực tiếp từ
dataset **đã build sẵn** của `LSTM_Py_Backend_v2/datasets/<Tên_Hồ>/v2_*.npy`
(16 hồ, ~2022–2025), dataset này **đã được backup trên Hugging Face**
(`Anvo2004/dataset_all_lake`) nên không còn phụ thuộc 1 điểm lỗi (Excel local)
nữa — xem `data/tabular_dataset.py`.

## Thiết kế

- **Model GLOBAL, không train riêng từng hồ**: `LSTM_Py_Backend_v2` từng thử
  bỏ global-model để train riêng từng hồ, kết quả tệ hơn hẳn (A Vương NSE
  0.316 so với 0.804 của global model) — RF đi theo hướng global đã kiểm chứng
  tốt hơn.
- **Direct multi-horizon**: 24 Quantile Regression Forest riêng biệt (1 model
  ứng với 1 giờ dự báo tới, từ h+1 đến h+24), mỗi model tự cho cả 3 quantile
  P10/P50/P90 cùng lúc (dùng thư viện `quantile-forest`, không cần train 3 lần
  như XGBoost vì RF không có objective quantile native — QRF lấy quantile thực
  nghiệm từ phân phối giá trị tại các leaf node).
- **KHÔNG dùng mưa dự báo (oracle rain) làm input**: dataset gốc có `X_nwp`
  (mưa/nhiệt độ dự báo cho 24h tới) nhưng được build từ dữ liệu THỰC TẾ đã xảy
  ra (oracle), trong khi lúc serving thực tế chỉ có dự báo Open-Meteo (có sai
  số) — gây train/serve mismatch. RF/XGBoost ở đây bỏ hẳn `X_nwp`, chỉ dùng
  đặc trưng từ quá khứ (lag/rolling mưa tới 7 ngày, lưu lượng, mực nước) tại
  thời điểm hiện tại để dự báo 24h tới — không có mismatch, đơn giản hơn, và
  đặc trưng tích lũy mưa dài hạn (`rain_168h`...) đã nắm phần lớn tín hiệu độ
  ẩm đất/xu hướng dòng chảy mà mưa dự báo mang lại.
- **Fixed-date split** giống hệt `LSTM_Py_Backend_v2`/`train_global.py` để so
  NSE công bằng giữa 3 model: train `<2024-09-01`, val `2024-09-01..2025-01-01`
  (mùa lũ 2024), test `>=2025-09-01` (mùa lũ 2025, holdout).

## Chạy local

```bash
pip install -r requirements.txt
python main_train.py       # -> artifacts/rf/h01.joblib .. h24.joblib
python main_evaluate.py    # -> ket_qua_danh_gia_2025_rf.xlsx, ket_qua_nse_theo_gio_rf.xlsx
python main_api.py         # -> serve tại http://localhost:8002 (POST /predict-rf, GET /health)
```

## Deploy serving (VPS)

```bash
docker build -t rf-api .
docker run -d --restart always -p 8002:8002 --name rf-container rf-api
```
Node backend cần biến môi trường `RF_API_URL=http://<vps-ip>:8002/predict-rf`
(mặc định trong `src/jobs/rfForecast.job.js` đã trỏ tới `103.107.182.191:8002`).

## Chạy trên Kaggle (train)

```bash
python kaggle/generate_notebook.py   # -> kaggle/train_rf.ipynb
```
Upload `train_rf.ipynb` lên Kaggle, **không cần bật GPU** (RF chạy CPU thuần).
Không cần attach Dataset — notebook tự tải dữ liệu từ Hugging Face
`Anvo2004/dataset_all_lake` nếu không thấy `/kaggle/input`.

## Sau khi train xong

Copy `artifacts/rf/` (24 file `.joblib`, nhẹ) vào thư mục này, rồi commit vào
git — khác với LSTM (`.pt` nặng, dùng Git LFS), RF/XGBoost artifacts đủ nhẹ để
commit thẳng.
