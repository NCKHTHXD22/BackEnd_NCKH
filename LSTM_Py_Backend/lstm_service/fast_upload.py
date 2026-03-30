import os
from huggingface_hub import HfApi

# Cấu hình
TOKEN = "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"
REPO_ID = "Anvo2004/lstm-inflow-api"
LOCAL_DIR = r"d:\VoNguyenAn\Demo Code VS\BackEnd_NCKH\LSTM_Py_Backend\lstm_service\artifacts"

api = HfApi()

def upload_models():
    print(f"--- Đang bắt đầu upload mô hình lên {REPO_ID} ---")
    
    if not os.path.exists(LOCAL_DIR):
        print(f"LỖI: Thư mục {LOCAL_DIR} không tồn tại!")
        return

    files = [f for f in os.listdir(LOCAL_DIR) if f.endswith('.pt') or f.endswith('.pkl')]
    
    if not files:
        print("Không tìm thấy file .pt hoặc .pkl nào trong thư mục artifacts!")
        return

    print(f"Tìm thấy {len(files)} files. Bắt đầu upload...")

    for file_name in files:
        local_path = os.path.join(LOCAL_DIR, file_name)
        path_in_repo = f"artifacts/{file_name}"
        
        try:
            print(f"Đang đẩy: {file_name}...", end=" ", flush=True)
            api.upload_file(
                path_or_fileobj=local_path,
                path_in_repo=path_in_repo,
                repo_id=REPO_ID,
                repo_type="space",
                token=TOKEN
            )
            print("Xong! ✅")
        except Exception as e:
            print(f"Thất bại! ❌ Lỗi: {e}")

    print("\n--- Hoàn tất quá trình upload! ---")

if __name__ == "__main__":
    upload_models()
