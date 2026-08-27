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
(2026-08-26, sau đó phục hồi lại ở `DataSet/`). Thư mục này lấy dữ liệu trực
tiếp từ dataset **đã build sẵn** của `LSTM_Py_Backend_v2/datasets/<Tên_Hồ>/v2_*.npy`
(16 hồ, ~2022–2025) thay vì đọc lại Excel — xem `data/tabular_dataset.py`.

**Lưu ý quan trọng**: repo Hugging Face `Anvo2004/dataset_all_lake` (dùng làm
fallback tự động khi chạy trên Kaggle) **hiện KHÔNG có file zip thật** — đã
verify (2026-08-26), repo chỉ có `.gitattributes`. Dùng file zip local đã
verify CRC OK thay thế: `LSTM_Py_Backend_v2/datasets_all_reservoirs.zip`
(25.5GB) — **phải tự Add Input Dataset này lên Kaggle thủ công**, đừng dựa
vào fallback tự động.

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
- **CÓ dùng mưa dự báo dạng oracle** (theo đúng phương pháp của dự án): input
  gồm 47 feature quá khứ (mưa/lưu lượng/mực nước — dòng cuối hindcast window)
  **+ 6 feature "tương lai"** (`rain_fc, rain_fc_3h, rain_fc_6h, rain_fc_24h,
  temp_fc, wind_fc`, lấy từ `v2_X_nwp.npy`). Lúc TRAIN, phần "tương lai" này
  là dữ liệu THỰC TẾ đã xảy ra (oracle) — model học quy luật mưa→lũ từ dữ liệu
  hoàn chỉnh, chủ đích, giống hệt cách LSTM đang dùng `X_future`/`X_nwp`. Lúc
  SERVING (`main_api.py`), phần này được thay bằng dự báo Open-Meteo thật (có
  sai số dự báo thực tế) qua `data/data_fetcher.py::fetch_nwp_forecast()`.
- **Split 60% train / 20% validation / 20% test theo thời gian** (chronological,
  không random — tránh rò rỉ dữ liệu tương lai vào tập train). Xem
  `data/tabular_dataset.py::split_60_20_20()`.
- **Ưu tiên mùa lũ (tháng 9 → tháng 1 năm sau)**: trọng số mẫu (`sample_weight`)
  nhân thêm `RAINY_SEASON_WEIGHT` (mặc định 1.5×) cho mẫu rơi vào mùa lũ, cộng
  dồn với trọng số theo biên độ đỉnh lũ đã có (top 5% → ×2, top 1% → ×3).

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
**Phải tự Add Input** `LSTM_Py_Backend_v2/datasets_all_reservoirs.zip` làm
Kaggle Dataset trước khi Run All (fallback Hugging Face hiện không hoạt động
— xem cảnh báo ở trên).

## Sau khi train xong

Copy `artifacts/rf/` (24 file `.joblib`, nhẹ) vào thư mục này, rồi commit vào
git — khác với LSTM (`.pt` nặng, dùng Git LFS), RF/XGBoost artifacts đủ nhẹ để
commit thẳng.
