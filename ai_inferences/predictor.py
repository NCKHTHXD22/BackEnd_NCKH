import math

import cv2
import numpy as np
from ultralytics import YOLO
import os

AB = 70
# Chieu cao bien bao (cm)
BD = 200
# Chieu cao cot tu mep duoi bien bao den mat duong (cm)

_DEFAULT_WEIGHTS = os.path.join(os.path.dirname(__file__), "weights", "best_train3.pt")

class PosePredictor:
    def __init__(self, model_path=_DEFAULT_WEIGHTS):
        # Đảm bảo bạn đã copy file best.pt vào thư mục ai_inference
        if not os.path.exists(model_path):
            print(f"Cảnh báo: Không tìm thấy model tại {model_path}. Hãy kiểm tra lại!")
            self.model = None
        else:
            try:
                self.model = YOLO(model_path)
                print("AI Model (Pose) đã load thành công!")
            except Exception as e:
                print(f"Lỗi load model YOLO: {e}")
                self.model = None

    def calculate_water_level(self, keypoints):
        p1 = keypoints[0]
        x1, y1 = p1[0], p1[1]
        p2 = keypoints[1]
        x2, y2 = p2[0], p2[1]
        p3 = keypoints[2]
        x3, y3 = p3[0], p3[1]

        ab = math.sqrt((x1-x2)**2 + (y1-y2)**2)
        bc = math.sqrt((x2-x3)**2 + (y2-y3)**2)

        BC = AB*(bc/ab)
        CD = BD - BC

        if CD<0:
            CD=0
        return CD

    # --- Các hàm hỗ trợ (Letterbox, Restore Coords) ---
    def letterbox(self, image, size=640):
        h, w = image.shape[:2]
        scale = min(size / h, size / w)
        new_w, new_h = int(w * scale), int(h * scale)
        resized = cv2.resize(image, (new_w, new_h))
        pad_image = np.full((size, size, 3), 114, dtype=np.uint8)
        pad_top, pad_left = (size - new_h) // 2, (size - new_w) // 2
        pad_image[pad_top:pad_top + new_h, pad_left:pad_left + new_w] = resized
        return pad_image, scale, (pad_left, pad_top)

    def restore_coords(self, bbox, kpts, scale, pad, down_scale_ratio=1.0):
        px, py = pad
        bbox[0] = (bbox[0] - px) / scale * down_scale_ratio
        bbox[1] = (bbox[1] - py) / scale * down_scale_ratio
        bbox[2] = (bbox[2] - px) / scale * down_scale_ratio
        bbox[3] = (bbox[3] - py) / scale * down_scale_ratio
        for kp in kpts:
            kp[0] = (kp[0] - px) / scale * down_scale_ratio
            kp[1] = (kp[1] - py) / scale * down_scale_ratio
        return bbox, kpts

    # --- Hàm xử lý chính (Tên hàm bắt buộc phải là process_image) ---
    def process_image(self, input_path, output_path):
        """
        Đọc ảnh từ input_path -> Chạy AI -> Vẽ đè -> Lưu vào output_path
        Trả về: (Label, Score)
        """
        if self.model is None:
            # Nếu không có model, copy ảnh gốc sang output để không bị lỗi file
            try:
                img = cv2.imread(input_path)
                cv2.imwrite(output_path, img)
            except:
                pass
            return "NO_MODEL", 0.0

        try:
            img = cv2.imread(input_path)
            if img is None: return "ERROR_READ", 0.0

            # 1. Preprocess (Letterbox)
            padded, scale, pad = self.letterbox(img)

            # 2. Predict
            results = self.model(padded, verbose=False)[0]

            max_score = 0.0
            best_kpts = None

            # 3. Vẽ kết quả lên ảnh gốc
            if results.boxes:
                for box, kpts, conf in zip(results.boxes.xyxy.cpu().numpy(),
                                           results.keypoints.xy.cpu().numpy(),
                                           results.boxes.conf.cpu().numpy()):

                    # Restore coords về ảnh gốc
                    box, kpts = self.restore_coords(box.tolist(), kpts.tolist(), scale, pad)

                    # Cập nhật score cao nhất
                    if conf > max_score:
                        max_score = conf
                        best_kpts = kpts

                    # Vẽ Bbox
                    x1, y1, x2, y2 = map(int, box)
                    cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)

                    # Vẽ Keypoints
                    for idx, (kx, ky) in enumerate(kpts):
                        if kx == 0 and ky == 0: continue  # Skip điểm ẩn
                        cv2.circle(img, (int(kx), int(ky)), 3, (0, 0, 255), -1)

            if max_score < 0.2:
                return False

            # 4. Lưu ảnh kết quả (Output)
            cv2.imwrite(output_path, img)

            # 5. Độ ngập
            if best_kpts is not None:
                flood_level = self.calculate_water_level(best_kpts)
            else:
                flood_level = 0

            # Logic giả định nhãn dựa trên score
            if flood_level <= 5:
                label_level = "SAFE"
            elif flood_level <= 15:
                label_level = "HIGH"
            elif flood_level <= 30:
                label_level = "DEEP"
            else:
                label_level = "DANGEROUS"

            print(flood_level)
            return label_level, flood_level, max_score

        except Exception as e:
            print(f"Lỗi AI: {e}")
            # Nếu lỗi, cố gắng copy ảnh gốc sang output
            try:
                img = cv2.imread(input_path)
                cv2.imwrite(output_path, img)
            except:
                pass
            return "ERROR_AI", 0.0


# Instance dùng chung cho toàn bộ Server
predictor = PosePredictor()