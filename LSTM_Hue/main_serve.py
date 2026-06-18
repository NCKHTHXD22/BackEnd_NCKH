"""
Entry point: Khởi động HueLSTM API server.

Chạy: python main_serve.py
       MODEL_PATH=artifacts/hue_lstm.pt python main_serve.py --port 8001
"""

import argparse
import os


def main():
    parser = argparse.ArgumentParser(description="HueLSTM Flood Forecast API Server")
    parser.add_argument("--host",  type=str, default="0.0.0.0")
    parser.add_argument("--port",  type=int, default=8001)
    parser.add_argument("--model", type=str, default="artifacts/hue_lstm.pt",
                        help="Path tới model .pt file")
    parser.add_argument("--reload", action="store_true", help="Hot reload (dev mode)")
    args = parser.parse_args()

    os.environ["MODEL_PATH"] = args.model

    import uvicorn
    uvicorn.run(
        "api.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info",
    )


if __name__ == "__main__":
    main()
