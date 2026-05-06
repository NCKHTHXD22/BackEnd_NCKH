"""
Upload files lên HuggingFace Space dùng HTTP API thuần
(Tương thích Python 3.14+)
"""
import ssl
import urllib.request
import urllib.parse
import json
import base64
from pathlib import Path

HF_TOKEN = "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"
REPO_ID  = "Anvo2004/flood-ai-inference"
BASE_DIR = Path("ai_inferences")
API_BASE = "https://huggingface.co/api"

HEADERS = {
    "Authorization": f"Bearer {HF_TOKEN}",
    "Content-Type": "application/json",
}

ctx = ssl.create_default_context()

FILES_TO_UPLOAD = [
    ("README.md",              "README.md"),
    ("Dockerfile",             "Dockerfile"),
    ("requirements.txt",       "requirements.txt"),
    ("predictor.py",           "predictor.py"),
    ("server.py",              "server.py"),
    ("weights/best_train3.pt", "weights/best_train3.pt"),
]

def upload_file(local_path: Path, remote_path: str):
    """Upload 1 file lên HF Space qua commit API"""
    content_bytes = local_path.read_bytes()
    content_b64   = base64.b64encode(content_bytes).decode("utf-8")

    payload = json.dumps({
        "files": [{
            "path": remote_path,
            "content": content_b64,
            "encoding": "base64",
        }],
        "commit_message": f"Add {remote_path}",
    }).encode("utf-8")

    url = f"{API_BASE}/spaces/{REPO_ID}/commit/main"
    req = urllib.request.Request(url, data=payload, headers={
        "Authorization": f"Bearer {HF_TOKEN}",
        "Content-Type": "application/json",
    }, method="POST")

    with urllib.request.urlopen(req, context=ctx, timeout=120) as resp:
        return json.loads(resp.read())

print(f"Uploading to: https://huggingface.co/spaces/{REPO_ID}\n")

for local_rel, remote_path in FILES_TO_UPLOAD:
    local_path = BASE_DIR / local_rel
    if not local_path.exists():
        print(f"  SKIP (not found): {local_path}")
        continue

    size_kb = local_path.stat().st_size / 1024
    print(f"  [{size_kb:6.1f} KB] {local_rel} -> {remote_path} ...", end="", flush=True)
    try:
        result = upload_file(local_path, remote_path)
        print(f" OK (commit: {result.get('commitOid','?')[:8]})")
    except Exception as e:
        print(f" FAILED: {e}")

print(f"\n{'='*60}")
print(f"Done! Space URL: https://huggingface.co/spaces/{REPO_ID}")
print(f"API Endpoint  : https://anvo2004-flood-ai-inference.hf.space/predict")
print(f"Health check  : https://anvo2004-flood-ai-inference.hf.space/health")
print(f"\nNote: Docker build se mat ~5-10 phut.")
print(f"Kiem tra build log tai Space URL.")
