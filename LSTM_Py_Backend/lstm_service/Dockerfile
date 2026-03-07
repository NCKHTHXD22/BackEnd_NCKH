# 1. Dùng bộ Python nhỏ gọn nhất để tiết kiệm dung lượng Build
FROM python:3.10-slim

# 2. Xóa bỏ các luồng đa nhiệm ảo để bảo vệ RAM của Server Hugging Face Free
# Đây là cách "chạy nhẹ đi" chuẩn nhất cho PyTorch/Tensorflow trên CPU
ENV OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    PyTorch_WORKER_POOL=0 \
    CUDA_VISIBLE_DEVICES="" 

# 3. Mở cổng mạng
EXPOSE 7860

# 4. Set up thư mục làm việc chuẩn
WORKDIR /code

# 5. Copy requirements và cài đặt (làm riêng bước này để Docker nó Cache tải siêu nhanh)
COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# 6. Cấp quyền User (Hugging Face bắt buộc phải có bước này)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
	PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# 7. Copy toàn bộ mã nguồn (.py, dũ liệu models...) vào
COPY --chown=user . $HOME/app

# 8. Lệnh khởi chạy cuối cùng
CMD ["uvicorn", "main_api:app", "--host", "0.0.0.0", "--port", "7860"]
