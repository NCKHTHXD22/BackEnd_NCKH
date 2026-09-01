# Nội dung bổ sung cho HoSo_DN.docx

Ghi chú: mỗi mục dưới đây ghi rõ **vị trí chèn** (dựa theo caption/tiêu đề đã có sẵn trong file gốc) để bạn dễ dán đúng chỗ. Các số liệu kỹ thuật (cron job, ngưỡng cảnh báo, logic YOLO Pose, thông số LSTM) đã được đối chiếu với code thật trong repo — **không bịa số liệu**. Riêng phần ARIMAX được viết theo đúng định hướng bạn xác nhận: trọng tâm giai đoạn này là nền tảng Web/App/Desktop, đánh giá định lượng đầy đủ mô hình dự báo là hướng phát triển tiếp theo.

---

## 1. DANH MỤC TỪ VIẾT TẮT, KÝ HIỆU, THUẬT NGỮ
*(Chèn ngay sau tiêu đề "DANH MỤC TỪ VIẾT TẮT, KÝ HIỆU, THUẬT NGỮ")*

| Từ viết tắt | Giải nghĩa |
|---|---|
| AI | Artificial Intelligence – Trí tuệ nhân tạo |
| API | Application Programming Interface – Giao diện lập trình ứng dụng |
| ARIMAX | AutoRegressive Integrated Moving Average with eXogenous variables – Mô hình tự hồi quy tích hợp trung bình trượt có biến ngoại sinh |
| DSS | Decision Support System – Hệ thống hỗ trợ ra quyết định |
| GIS | Geographic Information System – Hệ thống thông tin địa lý |
| IDW | Inverse Distance Weighting – Nội suy nghịch đảo khoảng cách |
| LSTM | Long Short-Term Memory – Mạng bộ nhớ dài–ngắn hạn |
| MNC | Mực nước chết |
| MNDBT | Mực nước dâng bình thường |
| MNGC | Mực nước gia cường |
| NCHMF | National Center for Hydro-Meteorological Forecasting – Trung tâm Dự báo Khí tượng Thủy văn Quốc gia |
| NSE | Nash–Sutcliffe Efficiency – Hệ số hiệu quả Nash–Sutcliffe |
| NWP | Numerical Weather Prediction – Dự báo thời tiết số |
| OA | Official Account – Tài khoản chính thức (Zalo) |
| PCTT | Phòng, chống thiên tai |
| Q10/Q50/Q90 | Các phân vị dự báo 10%, 50% (trung vị), 90% của dải bất định |
| REST/RESTful API | Representational State Transfer – Kiến trúc dịch vụ web dựa trên HTTP |
| SPA | Single Page Application – Ứng dụng đơn trang |
| UBND | Ủy ban nhân dân |
| VNDMS | Hệ thống đo mưa chuyên dùng (Vietnam Disaster Monitoring System) |
| VPS | Virtual Private Server – Máy chủ riêng ảo |
| WebGIS | Web-based Geographic Information System – Hệ thống thông tin địa lý trên nền Web |
| WPF | Windows Presentation Foundation – Nền tảng xây dựng giao diện Desktop của Microsoft |
| YOLO | You Only Look Once – Họ mô hình phát hiện đối tượng theo thời gian thực |

---

## 2. ĐỐI TƯỢNG NGHIÊN CỨU, PHẠM VI NGHIÊN CỨU, ĐỐI TƯỢNG KHẢO SÁT
*(Chèn ngay sau tiêu đề "Phạm vi nghiên cứu" ở Phần mở đầu, mục Phương pháp tiếp cận)*

**Đối tượng nghiên cứu:**
- Nền tảng phần mềm cảnh báo ngập lụt đa kênh, gồm ứng dụng Web (WebGIS) cho cơ quan quản lý, ứng dụng Di động cho người dân và công cụ Desktop DSS cho đơn vị vận hành hồ chứa.
- Kiến trúc backend và cơ sở dữ liệu dùng chung phục vụ đồng bộ dữ liệu thời gian thực giữa các nền tảng.
- Mô hình dự báo thủy văn LSTM Encoder–Decoder và mô-đun thị giác máy tính (YOLO) ước lượng mức ngập từ ảnh hiện trường.
- Cơ chế thu nhận và khai thác dữ liệu cộng đồng, bao gồm kênh tương tác qua Zalo Official Account.

**Phạm vi nghiên cứu:**
- *Không gian:* lưu vực sông Vu Gia – Thu Bồn, tập trung tại địa bàn thành phố Đà Nẵng và các khu vực hạ du thuộc tỉnh Quảng Nam (cũ).
- *Thời gian:* dữ liệu thủy văn, khí tượng và vận hành hồ chứa được thu thập và xử lý trong giai đoạn 2024–2026; nền tảng được triển khai thử nghiệm thực tế từ năm 2026.
- *Kỹ thuật:* đề tài tập trung vào bài toán **tích hợp hệ thống phần mềm** (Web – Mobile – Desktop – Backend – Zalo OA) và xây dựng chu trình dữ liệu khép kín giữa dự báo AI, quan trắc và dữ liệu cộng đồng. Việc tối ưu và đánh giá định lượng toàn diện độ chính xác của từng mô hình dự báo (LSTM, và mô hình bổ sung ARIMAX) trên đầy đủ 16 hồ chứa và nhiều mùa lũ không phải trọng tâm của giai đoạn này, mà được xác định là hướng phát triển tiếp theo (xem mục Kiến nghị).

**Đối tượng khảo sát:**
- Cán bộ, chuyên viên tại các cơ quan quản lý nhà nước và Ban Chỉ huy Phòng, chống thiên tai và Tìm kiếm cứu nạn thành phố Đà Nẵng.
- Người dân sinh sống tại khu vực hạ du thường xuyên chịu ảnh hưởng của ngập lụt.
- Cán bộ kỹ thuật tại các đơn vị quản lý, vận hành hồ chứa trên lưu vực Vu Gia – Thu Bồn.

---

## 3. NỘI DUNG CHO CÁC HÌNH/BẢNG CÒN TRỐNG (Phần Kết quả nghiên cứu và thảo luận)

### Hình 1. Kiến trúc tổng thể năm lớp của nền tảng
*(Chèn sau caption "Hình 1.")*

Nền tảng được tổ chức theo kiến trúc 5 lớp, ánh xạ trực tiếp vào cấu trúc mã nguồn của hệ thống backend:
1. **Lớp thu nhận dữ liệu (Data Ingestion)** — các tác vụ nền (cron job) tự động thu thập dữ liệu mưa, mực nước, lưu lượng hồ chứa từ các nguồn bên ngoài theo chu kỳ cố định.
2. **Lớp xử lý và dự báo (Processing & Forecasting)** — dịch vụ nghiệp vụ tính toán cân bằng nước, kiểm tra ngưỡng cảnh báo, và microservice Python gọi mô hình LSTM để sinh dự báo đa bước.
3. **Lớp quản lý dữ liệu (Data Management)** — các thực thể dữ liệu (hồ chứa, cảnh báo, bài đăng cộng đồng, nhật ký vận hành) và tầng truy xuất dữ liệu, lưu trữ tập trung trên MongoDB Atlas.
4. **Lớp dịch vụ (Service/API)** — các RESTful API cung cấp dữ liệu thống nhất cho mọi ứng dụng phía người dùng.
5. **Lớp ứng dụng (Application)** — ứng dụng Web (WebGIS), ứng dụng Di động và phần mềm Desktop DSS, cùng khai thác chung một nguồn dữ liệu qua lớp dịch vụ.

### Bảng 1. Các nguồn dữ liệu đầu vào và phương thức tích hợp vào hệ thống
*(Chèn sau caption "Bảng 1.")*

| Nguồn dữ liệu | Loại dữ liệu | Phương thức tích hợp | Chu kỳ cập nhật |
|---|---|---|---|
| Cổng thông tin PCTT Đà Nẵng (apiv2/pctt.danang.gov.vn) | Mực nước hồ (Z), lưu lượng đến/xả (Q_in, Q_out) của các hồ chứa | Cron job tự động gọi API qua proxy VPS (IP Việt Nam) | 1–15 phút/lần |
| Trạm đo mưa chuyên dùng (VRAIN) | Lượng mưa thời gian thực và lịch sử theo trạm | Cron job gọi API công khai VRAIN | 1 giờ/lần |
| Mô hình LSTM (Python/FastAPI, VPS) | Dự báo mực nước, lưu lượng xả 24h tới (dải Q10/Q50/Q90) | Gọi HTTP nội bộ từ backend Node.js sang FastAPI | 6 phút/lần |
| Dữ liệu cộng đồng (ảnh hiện trường, phản ánh) | Vị trí, hình ảnh, mô tả điểm ngập do người dân gửi | Người dùng nhập qua ứng dụng Web/Di động, lưu qua Cloudinary | Theo thời gian thực |

### Bảng 2. Các tác vụ nền (cron job) tự động trong backend của hệ thống
*(Chèn sau caption "Bảng 2.")*

| Tác vụ (job) | Lịch chạy | Chức năng |
|---|---|---|
| Đồng bộ mực nước/lưu lượng hồ (inflowLake) | Phút 10, 40 mỗi giờ | Cập nhật số liệu vận hành hồ chứa mới nhất từ lịch sử quan trắc |
| Đồng bộ lịch sử hồ chứa (inflowLakeHistory) | Phút 15, 45 mỗi giờ | Bổ sung dữ liệu quan trắc gần nhất (bù độ trễ của cổng PCTT) |
| Thu thập dữ liệu mưa thời gian thực (fetchRainData) | Đầu mỗi giờ | Lấy số liệu mưa tức thời từ trạm VRAIN |
| Thu thập lịch sử mưa theo giờ (fetchRainData – history) | Phút 5 mỗi giờ | Cập nhật chuỗi mưa lịch sử theo trạm |
| Tổng hợp mưa theo lưu vực hồ (rainLakeHistory) | Phút 2 mỗi giờ | Nội suy, gán lượng mưa cho từng tiểu lưu vực hồ chứa |
| Gọi mô hình dự báo LSTM (lstmForecast) | Phút 6 mỗi giờ | Gửi yêu cầu dự báo đến API Python, lưu kết quả (Q10/Q50/Q90) vào cơ sở dữ liệu |
| Kiểm tra ngưỡng cảnh báo (floodAlert) | Mỗi 15 phút | Tính toán, cập nhật cấp cảnh báo cho từng hồ và ghi nhật ký vận hành |

### Hình 6. Dashboard quản trị của ứng dụng Web
*(Chèn sau caption "Hình 6.")*

Dashboard quản trị cung cấp cho cán bộ quản lý một giao diện tập trung để duyệt các bài đăng cảnh báo ngập lụt do cộng đồng gửi lên, xem trực tiếp kết quả phân tích ảnh của mô-đun AI (mức ngập ước lượng, độ tin cậy) và theo dõi nhật ký vận hành hồ chứa theo thời gian thực. Các bài đăng được hệ thống AI tự động phân loại theo mức độ tin cậy: những trường hợp mức ngập ước lượng vượt ngưỡng cảnh báo sẽ được tự động duyệt hiển thị công khai, các trường hợp còn lại được chuyển sang hàng chờ để cán bộ kiểm duyệt thủ công trước khi công bố.

### Bảng 3. Các mức cảnh báo lũ và điều kiện kích hoạt trên nền tảng Web
*(Chèn sau caption "Bảng 3.")*

Hệ thống phân loại cảnh báo theo 4 cấp độ, dựa trên so sánh mực nước hồ hiện tại và mực nước dự báo (từ mô hình LSTM, horizon 24h) với các ngưỡng đặc trưng của từng hồ chứa (mực nước chết – MNC, mực nước dâng bình thường – MNDBT, mực nước gia cường – MNGC, cao trình đỉnh đập):

| Cấp cảnh báo | Điều kiện kích hoạt |
|---|---|
| Bình thường (normal) | Mực nước hiện tại và dự báo đều thấp hơn (MNDBT − 1,0 m) |
| Chú ý (watch) | Mực nước dự báo nằm trong khoảng 1,0 m dưới MNDBT |
| Cảnh báo (warning) | Mực nước hiện tại hoặc dự báo đạt/vượt MNDBT |
| Nguy hiểm (danger) | Mực nước hiện tại hoặc dự báo đạt/vượt MNGC |

Ngoài ra, hệ thống có cơ chế kiểm tra tính hợp lệ của dữ liệu cảm biến: nếu giá trị mực nước nhận được nằm ngoài khoảng vật lý hợp lý của hồ (thấp hơn MNC − 10 m hoặc cao hơn cao trình đỉnh đập + 2 m), dữ liệu sẽ được gắn cờ lỗi và không được dùng để phát cảnh báo, nhằm tránh cảnh báo giả do lỗi thu thập dữ liệu.

### Hình 8. Quy trình xử lý ảnh AI YOLO Pose
*(Chèn sau caption "Hình 8.")*

Khác với cách tiếp cận ước lượng mức ngập dựa trên tư thế cơ thể người thường thấy trong các nghiên cứu khác, mô-đun được xây dựng dựa trên nguyên lý **tam giác đồng dạng**, sử dụng biển báo giao thông làm vật chuẩn đối chiếu — vốn có kích thước tiêu chuẩn hóa và xuất hiện phổ biến tại các điểm ngập đô thị. Quy trình xử lý gồm các bước: (1) mô hình YOLO Pose phát hiện 3 điểm mốc trên cột biển báo trong ảnh do người dân gửi lên (đỉnh biển báo, đáy biển báo, điểm mực nước cắt ngang cột); (2) tính khoảng cách pixel giữa các điểm mốc; (3) dựa trên chiều cao thực tế đã biết của biển báo (quy ước 70 cm) và chiều cao cột từ đáy biển báo đến mặt đường (quy ước 200 cm), hệ thống quy đổi tỉ lệ pixel sang khoảng cách thực để ước lượng độ sâu ngập tại vị trí chụp ảnh. Nếu độ tin cậy phát hiện biển báo dưới ngưỡng tối thiểu, hệ thống xác định ảnh không đủ điều kiện phân tích và trả về trạng thái "không xác định".

### Bảng 4. Phân loại mức ngập bằng YOLO Pose và quy tắc tự động duyệt bài đăng
*(Chèn sau caption "Bảng 4.")*

| Mức ngập ước lượng | Phân loại | Quy tắc duyệt bài đăng |
|---|---|---|
| ≤ 5 cm | An toàn (SAFE) | Chờ kiểm duyệt của quản trị viên |
| 5–15 cm | Ngập cao (HIGH) | Tự động duyệt hiển thị (≥ 10 cm) |
| 15–30 cm | Ngập sâu (DEEP) | Tự động duyệt hiển thị |
| > 30 cm | Nguy hiểm (DANGEROUS) | Tự động duyệt hiển thị |

Ngưỡng tự động duyệt được đặt tại mức ngập ước lượng ≥ 10 cm: các bài đăng có mức ngập từ ngưỡng này trở lên được xem là có giá trị cảnh báo cộng đồng cao và được hệ thống tự động công khai ngay để đảm bảo tính kịp thời, trong khi các trường hợp mức ngập thấp hơn được chuyển sang hàng chờ để quản trị viên xác minh trước khi hiển thị, nhằm hạn chế thông tin nhiễu.

### Hình 10. Ứng dụng di động
*(Chèn sau caption "Hình 10.")*

Ứng dụng Di động lấy người dân làm trung tâm, cung cấp bản đồ thời gian thực hiển thị các điểm cảnh báo ngập lụt và yêu cầu hỗ trợ đang chờ xử lý trong khu vực. Người dùng có thể gửi báo cáo hiện trường kèm hình ảnh, xem cảnh báo theo vị trí hiện tại, tra cứu tuyến đường sơ tán an toàn và gửi yêu cầu cứu hộ khẩn cấp kèm số điện thoại liên hệ trực tiếp đến lực lượng cứu hộ tại địa phương.

### Hình 11. Quy trình hỗ trợ quyết định DSS và giao diện Desktop DSS
*(Chèn sau caption "Hình 11.")*

Công cụ Desktop DSS (xây dựng trên nền WPF) hỗ trợ đơn vị vận hành hồ chứa mô phỏng nhanh các kịch bản xả lũ. Quy trình gồm: tiếp nhận dự báo lưu lượng đến hồ từ mô hình LSTM, cho phép cán bộ vận hành thử nhiều tổ hợp lưu lượng xả khác nhau, tự động tính toán diễn biến mực nước hạ du tương ứng với từng kịch bản, và trực quan hóa kết quả để hỗ trợ ra quyết định xả lũ an toàn, cân bằng giữa mục tiêu giảm lũ hạ du và an toàn công trình đầu mối.

### Hình 12. Tổng quan chức năng chính vận hành liên hồ chứa
*(Chèn sau caption "Hình 12.")*

Giao diện tổng quan cho phép cán bộ vận hành theo dõi đồng thời trạng thái của nhiều hồ chứa trên cùng lưu vực, bao gồm mực nước hiện tại, dự báo lưu lượng đến, cấp cảnh báo và lịch sử thao tác xả lũ — phục vụ công tác điều phối vận hành liên hồ trong tình huống lũ trên diện rộng.

### Hình 20. Mô phỏng lại trận lũ tháng 10/2025 bằng mô hình LSTM
*(Chèn sau caption "Hình 20.")*

Mô hình LSTM Encoder–Decoder được thử nghiệm mô phỏng lại đợt lũ tháng 10/2025 tại hồ Sông Tranh 2, cho kết quả dự báo mực nước bám sát diễn biến thực đo trong dải bất định Q10–Q90, đạt hệ số hiệu quả Nash–Sutcliffe (NSE) ở mức khả chấp theo tiêu chuẩn thủy văn (NSE > 0,5). Đây là kết quả bước đầu trên một hồ chứa đại diện; việc đánh giá định lượng đầy đủ trên toàn bộ 16 hồ chứa và nhiều mùa lũ khác nhau được xác định là hướng phát triển tiếp theo của đề tài, do giai đoạn hiện tại tập trung nguồn lực chính vào việc hoàn thiện nền tảng Web – Di động – Desktop.

### Bảng 6. Chỉ số đánh giá mô hình ARIMAX theo thời gian dự báo trước (hồ Sông Tranh 2)
*(Chèn sau caption "Bảng 6." — **cần bạn bổ sung số liệu ARIMAX thật của bạn vào bảng này**, mình chỉ để khung bảng và phần diễn giải chung)*

| Thời gian dự báo trước | NSE | RMSE | MAE |
|---|---|---|---|
| 1 ngày | *(điền số liệu)* | | |
| 3 ngày | *(điền số liệu)* | | |
| 5 ngày | *(điền số liệu)* | | |
| 7 ngày | *(điền số liệu)* | | |

Mô hình ARIMAX được đề xuất bổ sung cho bài toán dự báo ngắn hạn nhờ ưu điểm về tốc độ huấn luyện và khả năng diễn giải kết quả thông qua các biến ngoại sinh (mưa, lưu lượng đến). Trong phạm vi đề tài hiện tại, nhóm nghiên cứu ưu tiên nguồn lực cho việc hoàn thiện nền tảng tích hợp (Web – Di động – Desktop DSS – Zalo OA); việc huấn luyện và đánh giá định lượng đầy đủ mô hình ARIMAX song song với LSTM trên tất cả các hồ chứa sẽ được hoàn thiện ở giai đoạn tiếp theo.

### Bảng 7. So sánh vai trò của hai mô hình trong bộ máy dự báo của hệ thống
*(Chèn sau caption "Bảng 7.")*

| Tiêu chí | ARIMAX | LSTM Encoder–Decoder |
|---|---|---|
| Vai trò | Dự báo xu thế ngắn hạn, tham chiếu nhanh | Dự báo đa bước có dải bất định, phục vụ cảnh báo sớm |
| Đầu vào | Chuỗi thời gian mực nước/lưu lượng + biến ngoại sinh (mưa) | Chuỗi lịch sử quan trắc (240 giờ) kết hợp dữ liệu dự báo thời tiết số (NWP) |
| Đầu ra | Giá trị dự báo điểm | Dải phân vị Q10/Q50/Q90 cho 24 giờ tới, tại 16 hồ chứa |
| Ưu điểm | Huấn luyện nhanh, dễ diễn giải | Nắm bắt quan hệ phi tuyến dài hạn, định lượng độ bất định |
| Hạn chế | Khó mở rộng cho nhiều hồ đồng thời | Cần khối lượng dữ liệu lịch sử lớn để huấn luyện ổn định |
| Trạng thái triển khai | Đề xuất, đang hoàn thiện | Đã tích hợp và vận hành trên hệ thống backend thực tế |

---

## 4. PHẦN ZALO OA — Hình 13–19 và Bảng 5
*(Đây là phần bạn yêu cầu trọng tâm)*

### Đoạn dẫn nhập trước Hình 13
*(Chèn ngay trước caption "Hình 13.")*

Bên cạnh ứng dụng Web và Di động, nền tảng còn mở rộng một kênh tương tác bổ sung dành cho người dân thông qua **Zalo Official Account (OA)** — nền tảng nhắn tin phổ biến nhất tại Việt Nam, giúp người dân không cần cài đặt thêm ứng dụng vẫn có thể tiếp cận thông tin cảnh báo và gửi phản ánh. Ở giai đoạn hiện tại, nhóm nghiên cứu đã triển khai thí điểm một trang Zalo OA đã được Zalo xác thực cho UBND phường/xã đại diện tại khu vực hạ du, với chat menu tiếp nhận phản ánh của người dân; song song đó, kiến trúc tích hợp API đầy đủ giữa Zalo OA và hệ thống backend trung tâm được đề xuất như định hướng mở rộng.

### Hình 13. Giao diện Zalo OA của UBND phường
*(Chèn sau caption "Hình 13.")*

Trang Zalo OA của UBND phường cung cấp chat menu với nhóm chức năng "Góp ý – Phản ánh", trong đó có mục riêng "Hỗ trợ ngập lụt" để người dân gửi phản ánh nhanh về tình hình ngập lụt tại khu vực sinh sống mà không cần rời khỏi ứng dụng Zalo quen thuộc hằng ngày.

### Hình 14. Trang chủ Official Account của UBND phường trên Zalo
*(Chèn sau caption "Hình 14.")*

Trang OA đã được Zalo xác thực (official verified), hiển thị đầy đủ thông tin liên hệ và đường dẫn tới cổng thông tin điện tử của địa phương, giúp tăng độ tin cậy đối với người dân khi tương tác với kênh cảnh báo qua Zalo.

### Hình 15. Sơ đồ kiến trúc hệ thống tích hợp Zalo OA
*(Chèn sau caption "Hình 15.")*

Kiến trúc mở rộng được đề xuất theo luồng: Người dân tương tác qua Zalo OA → Zalo OA API tiếp nhận và chuyển tiếp yêu cầu → Backend Node.js/Express (triển khai trên VPS) xử lý nghiệp vụ và xác thực → dữ liệu được lưu trữ tại MongoDB Atlas, dữ liệu phiên/hàng đợi tạm tại Upstash Redis, hình ảnh đính kèm lưu trữ tại Cloudinary. Kiến trúc này cho phép dữ liệu gửi qua Zalo OA được đồng bộ vào cùng cơ sở dữ liệu dùng chung với ứng dụng Web và Di động, thay vì vận hành như một kênh tách biệt.

### Hình 16. Màn hình đăng nhập bằng Zalo và bản đồ yêu cầu cứu trợ
*(Chèn sau caption "Hình 16.")*

Người dân đăng nhập nhanh bằng tài khoản Zalo sẵn có (không cần đăng ký mới), sau đó có thể xem trên bản đồ các yêu cầu cứu trợ, cứu nạn đang chờ xử lý trong ranh giới xã/phường của mình — minh họa thử nghiệm tại UBND Xã An Hải.

### Hình 17. Biểu mẫu gửi cảnh báo từ người dân
*(Chèn sau caption "Hình 17.")*

Biểu mẫu thu thập các thông tin cần thiết để cơ quan chức năng xử lý nhanh: tiêu đề phản ánh, số điện thoại liên hệ, nội dung mô tả, địa chỉ (lấy tự động theo định vị hoặc nhập thủ công) và tối đa 5 ảnh minh họa hiện trường.

### Hình 18. Kết quả sau khi gửi cảnh báo
*(Chèn sau caption "Hình 18.")*

Sau khi gửi, hệ thống xác nhận đã tiếp nhận phản ánh, cấp một mã cảnh báo riêng để người dân tra cứu lại trạng thái xử lý, đồng thời hiển thị lại đầy đủ thông tin đã gửi để đối chiếu.

### Hình 19. Quy trình chuyển tiếp và xử lý cảnh báo sau khi gửi
*(Chèn sau caption "Hình 19.")*

Cảnh báo sau khi gửi được chuyển tới cổng tiếp nhận của đơn vị xử lý tại địa phương và thành phố. Giao diện quản lý cho phép phân loại danh sách cảnh báo theo nguồn góp ý, cấp độ sự cố và thời hạn xử lý, giúp cơ quan chức năng ưu tiên hỗ trợ người dân kịp thời hơn.

### Bảng 5. So sánh hiện trạng thiết kế và định hướng mở rộng của kênh hỗ trợ người dân qua Zalo Official Account
*(Chèn sau caption "Bảng 5.")*

| Tiêu chí | Hiện trạng (đã triển khai thí điểm) | Định hướng mở rộng |
|---|---|---|
| Nền tảng | Trang Zalo OA đã được Zalo xác thực, vận hành cho 1 UBND phường/xã thí điểm | Nhân rộng cho toàn bộ các phường/xã thuộc khu vực hạ du |
| Tiếp nhận phản ánh | Qua chat menu "Góp ý – Phản ánh" trên Zalo, xử lý bán thủ công | Đồng bộ tự động vào backend qua Zalo OA API, không cần thao tác thủ công trung gian |
| Lưu trữ dữ liệu | Chưa kết nối trực tiếp với cơ sở dữ liệu trung tâm của nền tảng | Đồng bộ vào cùng cơ sở dữ liệu dùng chung (MongoDB Atlas) với ứng dụng Web/Di động |
| Xác thực người dùng | Đăng nhập bằng tài khoản Zalo sẵn có | Liên kết tài khoản Zalo với hồ sơ người dùng thống nhất trên toàn nền tảng |
| Xử lý ảnh hiện trường | Người dân gửi ảnh qua chat, cán bộ xem thủ công | Tự động đưa ảnh vào mô-đun AI (YOLO) để ước lượng mức ngập như trên ứng dụng Web/Di động |
| Thông báo phản hồi | Cán bộ phản hồi thủ công qua Zalo | Gửi cảnh báo/thông báo trạng thái tự động qua tin nhắn Zalo OA (broadcast theo khu vực) |

---

## 5. KẾT LUẬN VÀ KIẾN NGHỊ
*(Chèn sau tiêu đề "Kết luận" và "Kiến nghị và hướng phát triển")*

### Kết luận

Đề tài đã hoàn thành các mục tiêu đề ra ở giai đoạn hiện tại: xây dựng thành công nền tảng cảnh báo ngập lụt đa kênh, đồng bộ theo thời gian thực, bao gồm ứng dụng WebGIS cho cơ quan quản lý, ứng dụng Di động lấy người dân làm trung tâm, công cụ Desktop DSS hỗ trợ vận hành xả lũ và kênh tương tác thí điểm qua Zalo Official Account. Hệ thống backend dùng chung, được triển khai trên hạ tầng đám mây/VPS, đã vận hành ổn định với các tác vụ tự động thu thập dữ liệu quan trắc, gọi mô hình dự báo AI và kiểm tra ngưỡng cảnh báo theo chu kỳ liên tục.

Về mặt công nghệ, đề tài đã tích hợp hiệu quả mô hình LSTM Encoder–Decoder cho dự báo đa bước với dải bất định (Q10/Q50/Q90), cùng mô-đun thị giác máy tính giúp tự động ước lượng mức ngập từ ảnh hiện trường do cộng đồng cung cấp, qua đó rút ngắn thời gian xác minh thông tin và giảm phụ thuộc vào việc kiểm duyệt thủ công. Việc thiết lập chu trình dữ liệu khép kín giữa mô hình dự báo và "cảm biến xã hội" (dữ liệu cộng đồng) là đóng góp có ý nghĩa thực tiễn, giúp bổ sung thông tin tại những vị trí mà mạng lưới quan trắc truyền thống chưa bao phủ.

Trọng tâm của đề tài trong giai đoạn này là giải quyết bài toán **tích hợp nền tảng phần mềm** (Web – Di động – Desktop – Backend – Zalo OA) hơn là tối ưu hóa thuật toán dự báo; do đó việc đánh giá định lượng toàn diện các mô hình AI trên quy mô lớn (nhiều hồ chứa, nhiều mùa lũ) chưa được thực hiện đầy đủ và được xác định rõ là hướng phát triển tiếp theo.

### Kiến nghị và hướng phát triển

- Đề nghị Ban Chỉ huy Phòng, chống thiên tai và Tìm kiếm cứu nạn thành phố Đà Nẵng xem xét thử nghiệm tác nghiệp nền tảng trong mùa mưa lũ 2026–2027, trước tiên tại các phường/xã đã triển khai thí điểm kênh Zalo OA.
- Hoàn thiện tích hợp API đầy đủ giữa Zalo OA và backend trung tâm (theo kiến trúc đề xuất tại Hình 15), thay vì xử lý bán thủ công như hiện tại, đồng thời nhân rộng kênh Zalo OA cho các phường/xã khác thuộc khu vực hạ du.
- Bổ sung đánh giá định lượng đầy đủ (NSE, RMSE, MAE theo từng thời gian dự báo trước) cho cả hai mô hình LSTM và ARIMAX trên toàn bộ 16 hồ chứa và nhiều mùa lũ khác nhau, làm cơ sở lựa chọn mô hình phù hợp cho từng hồ.
- Mở rộng mô-đun thị giác máy tính với tập dữ liệu ảnh hiện trường phong phú hơn, cải thiện độ tin cậy phân loại mức ngập trong điều kiện ánh sáng và góc chụp đa dạng.
- Nghiên cứu khả năng nhân rộng mô hình nền tảng sang các địa phương khác thuộc khu vực miền Trung – Tây Nguyên có đặc điểm thủy văn tương tự (như Huế, Quảng Ngãi).

---

## 6. TÀI LIỆU THAM KHẢO
*(Chèn sau tiêu đề "TÀI LIỆU THAM KHẢO")*

[1] Hochreiter, S., & Schmidhuber, J. (1997). Long short-term memory. *Neural Computation*, 9(8), 1735–1780.

[2] Kratzert, F., Klotz, D., Brenner, C., Schulz, K., & Herrnegger, M. (2018). Rainfall–runoff modelling using Long Short-Term Memory (LSTM) networks. *Hydrology and Earth System Sciences*, 22(11), 6005–6022.

[3] Nearing, G., et al. (2024). Global prediction of extreme floods in ungauged watersheds. *Nature*, 627(8004), 559–563.

[4] Redmon, J., Divvala, S., Girshick, R., & Farhadi, A. (2016). You Only Look Once: Unified, real-time object detection. *Proceedings of the IEEE Conference on Computer Vision and Pattern Recognition (CVPR)*, 779–788.

[5] Box, G. E. P., Jenkins, G. M., Reinsel, G. C., & Ljung, G. M. (2015). *Time Series Analysis: Forecasting and Control* (5th ed.). Wiley.

[6] Ban Chỉ đạo Quốc gia về Phòng, chống thiên tai (2025). *Báo cáo thống kê thiệt hại do thiên tai năm 2025*. Hà Nội.

[7] Ủy ban nhân dân thành phố Đà Nẵng (2021). *Kế hoạch Phòng, chống thiên tai thành phố Đà Nẵng giai đoạn 2021–2025*. Đà Nẵng.

[8] Trung tâm Dự báo Khí tượng Thủy văn Quốc gia (NCHMF). Dữ liệu quan trắc khí tượng thủy văn lưu vực Vu Gia – Thu Bồn.

[9] Zalo for Developers. *Official Account API Documentation*. https://developers.zalo.me/

*(Ghi chú: bạn nên bổ sung thêm 1–2 tài liệu tham khảo tiếng Việt về đặc điểm thủy văn lưu vực Vu Gia – Thu Bồn nếu có, để cân bằng nguồn trong nước/quốc tế theo đúng hướng dẫn tại Phụ lục III của thể lệ cuộc thi.)*
