# Dockerfile cho Hugging Face Spaces
# Port bắt buộc là 7860 (HF standard)

FROM python:3.10-slim

# Cài system dependencies cho OpenCV
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# Tạo thư mục làm việc
WORKDIR /app

# Copy requirements trước để tận dụng Docker cache
COPY requirements.txt .

# Cài packages (YOLO + FastAPI)
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy toàn bộ repo vào /app (bao gồm mọi file và thư mục)
COPY . .

# Đảm bảo weights/ tồn tại; nếu file ở root thì di chuyển vào đúng chỗ
RUN mkdir -p weights && \
    if [ -f best_train3.pt ]; then mv best_train3.pt weights/best_train3.pt; fi && \
    ls -lh weights/

# Tạo thư mục tmp
RUN mkdir -p tmp

# HuggingFace Spaces yêu cầu port 7860
EXPOSE 7860

# Chạy server
CMD ["python", "server.py"]
