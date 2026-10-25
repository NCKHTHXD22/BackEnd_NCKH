# Dữ liệu tính toán (compute)

Kết quả các bước xử lý dùng làm **đầu vào tính toán** (mạng sông, trận lũ, diễn toán…), tách khỏi dữ liệu chỉ để
**hiển thị** ở `web/public/data/dt/` (lộ trình mục 2.4). File ở đây tạo lại được bằng `digital_twin/scripts/`.

| File | Tạo bởi | Nội dung |
|---|---|---|
| `events.json` | `09_data_inventory.py` | Trận lũ thử: hiệu chỉnh 29/10/2025, kiểm định 14/11/2023 |
| `network.json`, `network.geojson` | `10_network.py` | Mạng kết nối lưu vực – sông – hồ (nút, cạnh, hồ bậc thang, cảnh báo) |
| `events/*.json` | `11_event_series.py` | Chuỗi giờ của 16 hồ trong từng trận (giá trị sau QC + cờ số liệu thật) |
| `reservoir_check.json` | `12_reservoir_check.mjs` | Kiểm chứng cân bằng nước hồ chứa (4.1) bằng Q đến/Q xả đo |
| `routing/*.json` | `13_routing.py` | Diễn toán Muskingum-Cunge (5.1): lưu lượng theo giờ tại các nút + chỉ số kiểm chứng |

Quy ước: mỗi lớp trong `web/public/data/dt/layers.json` có `purpose` = `display` (chỉ hiển thị), `compute`
(đầu vào tính toán) hoặc `illustrative` (minh họa – giao diện gắn nhãn "minh họa"), kèm `accuracy`.
