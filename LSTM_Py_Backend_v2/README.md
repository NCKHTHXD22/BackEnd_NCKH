# LSTM_Py_Backend_v2 — 1 model độc lập cho từng hồ

R&D track tách riêng khỏi `LSTM_Py_Backend/lstm_service` (v1, production). Không đụng
tới v1 — hệ thống đang chạy (`main_api.py`, `main_predict.py`, `InflowForecastModel`)
giữ nguyên 100%.

## Vì sao tách riêng

Baseline NSE của model chung 16-hồ (`lstm_service`, xem `artifacts/plots/metrics.txt`,
đã cũ) lệch rất lớn giữa các hồ: >0.8 ở hồ tốt, xuống dưới 0.3 hoặc âm ở vài hồ. Đúng
những hồ NSE thấp trùng với các hồ đã được đánh dấu **"lỗi data"** trong
`INFLOW_CAPS_M3S` (`config/settings.py`) — nghi ngờ 1 vài hồ dữ liệu xấu đang kéo NSE
trung bình xuống hoặc gây nhiễu khi học chung.

→ Train **1 model độc lập cho mỗi hồ**: đổi dữ liệu 1 hồ không ảnh hưởng model của hồ
khác, dễ debug/so sánh NSE per-reservoir.

## Kiến trúc: `ReservoirLSTM` (`models/flood_lstm_v2.py`)

Dựa trên `FloodLSTMv2` (Google FloodHub-style, `lstm_service`) nhưng **bỏ hẳn reservoir
embedding** (mỗi model chỉ phục vụ 1 hồ, không cần phân biệt "hồ nào"):

- Hindcast Encoder (Bi-LSTM) → state handoff → Forecast Decoder (LSTM autoregressive)
- Cross-attention: decoder query → hindcast encoder key/value
- NWP Embedding (1 nguồn — Open-Meteo, đơn giản hơn NWPFusionLayer đa nguồn của bản gốc)
- Horizon-aware uncertainty scaling (P50 cố định, P5/P95 giãn theo lead-time)
- Quantile head 7 mức (P5–P95)
- `StationRainAttention` (tùy chọn, **tắt mặc định**) — học trọng số trạm mưa thay IDW
  cố định. Cần parse mưa từng trạm từ Excel trước (xem TODO trong `data/dataset_builder.py`).

Mặc định `hindcast_len=240h` (10 ngày), `forecast_len=24h` — **giữ đúng hợp đồng
production v1** (`SEQ_LENGTH`/`HORIZON` trong `lstm_service/config/settings.py`) để
model mới có thể thay v1 sau này mà không cần đổi phía Node.js/cron. Đổi trong
`config/settings.py::ReservoirLSTMConfig` nếu muốn thử horizon 7 ngày.

## Cải tiến so với v1/v2 cũ

1. **Seed cố định** — kết quả train lặp lại được (`training/train_reservoir.py::set_seed`).
2. **NSE theo lead-time** (`nse_per_horizon`) — biết độ chính xác suy giảm thế nào
   theo giờ dự báo, không chỉ 1 số NSE gộp.
3. **Chẩn đoán từng trận lũ** (`flood_event_diagnostics`) — NSE + sai số đỉnh riêng
   từng trận lũ, không gộp chung top-N% timestep.
4. **Đủ 47 features thay vì 46** — thêm temperature/relative_humidity/pressure qua
   Open-Meteo ERA5 archive (`data/nwp_fetcher.py`), dùng CÙNG nguồn cho cả train và
   inference nên hết mismatch (bản gốc từng phải bỏ 2 feature này vì lý do đó).

## Cách chạy

### 1. Build dataset cho 1 hồ

```bash
cd LSTM_Py_Backend_v2
python main_build_dataset.py --rid 2          # Ho Dak Mi 4 (NSE cu tot nhat, 0.868)
```

Cần chạy trong thư mục có `Data_Tung_Ho_Ma_Tran_Rong/` (giống `lstm_service`) và có
mạng để gọi Open-Meteo archive (bỏ `--no-nwp` nếu muốn test offline, nhưng
temperature/rh/pressure/et0 sẽ = 0).

Kết quả: `datasets/<Ten_Ho>/v2_X_hindcast.npy`, `v2_X_nwp.npy`, `v2_y.npy`,
`v2_timestamps.npy` + `artifacts/<Ten_Ho>/scaler.pkl`.

### 2a. Train local (có GPU)

```bash
python main_train.py --rid 2
```

### 2b. Train trên Kaggle (theo lựa chọn của bạn)

```bash
python kaggle/generate_notebook.py --rid 2
```

→ sinh `kaggle/train_reservoir_2.ipynb` (tự-chứa, không cần import package — đọc
trực tiếp nội dung `models/`, `training/event_metrics.py`, `data/reservoir_dataset.py`
lúc generate nên KHÔNG bị lệch code khi bạn sửa sau này).

1. Upload `datasets/<Ten_Ho>/` lên Kaggle làm Dataset.
2. Upload `kaggle/train_reservoir_<rid>.ipynb`, Add Input → attach dataset vừa tạo.
3. Run All → checkpoint + kết quả lưu ở `/kaggle/working/`.
4. Tải `reservoir_lstm.pt`, `metrics_test.json`, `nse_theo_gio.xlsx` về
   `artifacts/<Ten_Ho>/`.

Muốn train nhiều hồ liên tiếp bằng script thay vì notebook: `kaggle/train_kaggle.py --rid <id>`.

### 3. Lặp lại cho từng hồ

`config/reservoirs.py` liệt kê đủ 16 `rid`. Ưu tiên build/train trước các hồ:
- **Dữ liệu tốt** (baseline cũ NSE cao): Dak Mi 4 (rid=2), Song Bung 2 (rid=9),
  Song Tranh 3 (rid=12) — dùng để xác nhận pipeline mới hoạt động đúng trước.
- **"Lỗi data"** (ưu tiên kiểm tra sau khi có NSE mới): Song Bung 2 (rid=9),
  Song Bung 6 (rid=11), Dak Mi 3 (rid=14), Khe Dien (rid=15), Dak Mi 2 (rid=18)
  — xem comment trong `config/settings.py::INFLOW_CAPS_M3S`.

## StationRainAttention — mưa từng trạm (đã có dữ liệu thật)

Đã verify trực tiếp trên Excel thật (`HO_A_VUONG`, `HO_DAK_MI_4`): Col 121+i*24 chứa
24h mưa của trạm thứ i, đúng thứ tự `RESERVOIR_TO_STATIONS[rid]`, nhãn `(2022+)`/
`(2025+)` khớp với `available_from` trong config. `data/rain_matrix_loader.py::
load_station_rain_matrix()` parse cột này thật; `data/dataset_builder.py` build
`v2_station_rain.npy`/`v2_station_mask.npy`/`v2_station_prior_weights.npy` (trọng số
IDW từ `data/idw_calculator.py`, dùng để `StationRainAttention.init_prior()`) khi:

```python
cfg = ReservoirLSTMConfig(rid=2)
cfg.use_station_attention = True   # mặc định False
```

rồi build lại dataset (`main_build_dataset.py --rid 2`) và train lại từ đầu (đổi
input dim của model, checkpoint cũ không tương thích).

Lưu ý: 1 hồ có thể có trạm "(2022+)" và trạm "(2025+)" trộn lẫn — trạm mới sẽ có
`station_mask=False` (bị loại khỏi attention) ở các năm trước 2025, xử lý tự động
qua mask, không cần làm gì thêm.

## Việc chưa làm (TODO)

- Chưa có cách đưa `reservoir_lstm.pt` mới vào production (`lstm_service/main_api.py`)
  — đây là quyết định riêng sau khi có NSE mới đủ tốt để so sánh với v1.
