# 1. Python nho gon
FROM python:3.10-slim

# 2. Cong mang -- 8002, KHAC voi LSTM (7860/8000) va XGBoost (8001) tren cung VPS
EXPOSE 8002

WORKDIR /code

COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
	PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app
COPY --chown=user . $HOME/app

CMD ["uvicorn", "main_api:app", "--host", "0.0.0.0", "--port", "8002"]
