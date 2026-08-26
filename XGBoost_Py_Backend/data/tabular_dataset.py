# data/tabular_dataset.py
"""
Doc du lieu tabular tu dataset LSTM_Py_Backend_v2 da build san (sliding-window
hindcast, xem LSTM_Py_Backend_v2/data/dataset_builder.py) -- KHONG con phu
thuoc Data_Tung_Ho_Ma_Tran_Rong/ (Excel goc, da bi xoa khoi may local).

Chien luoc: lay dong CUOI CUNG cua moi hindcast window (= "hien tai", da chua
day du lag/rolling feature nen cua 240h qua khu) lam 1 dong tabular, target la
24 buoc inflow (sqrt-space) tiep theo -- direct multi-horizon, KHONG dung
X_nwp (mua du bao oracle) lam input:

  Ly do KHONG dung X_nwp: X_nwp trong dataset build tu inflow/rain THUC TE
  cua chinh khoang thoi gian tuong lai (oracle), trong khi luc serving thuc te
  chi co du bao Open-Meteo (co sai so) -- gay train/serve mismatch. Bo X_nwp
  giup RF/XGBoost khong gap mismatch nay (doi lai la khong tan dung duoc tin
  hieu mua du bao, nhung cac dac trung rain_*h/inflow_*h_avg tich luy toi 7
  ngay qua khu da nam bat phan lon dieu kien am dat/xu huong dong chay).

Tim nguon du lieu theo thu tu uu tien:
  1. Local dev: ../LSTM_Py_Backend_v2/datasets/<Ten_Ho>/v2_*.npy
  2. Kaggle: /kaggle/input/**/v2_X_hindcast.npy (dataset da attach vao notebook)
  3. Hugging Face Hub: Anvo2004/dataset_all_lake (fallback tu dong, cung nguon
     LSTM_Py_Backend_v2/kaggle/generate_notebook_all.py dang dung)
"""
import os
import numpy as np

from config.reservoirs import RESERVOIRS, NUM_RESERVOIRS
from config.settings import TRAIN_END, VAL_START, VAL_END, TEST_START, HF_REPO_ID, HF_ZIP_FILENAME

_LOCAL_CANDIDATES = [
    os.path.join("..", "LSTM_Py_Backend_v2", "datasets"),
    os.path.join("LSTM_Py_Backend_v2", "datasets"),
]

# Danh sach 47 feature (thu tu CHINH XAC khop cot cuoi cung cua v2_X_hindcast.npy
# -- xem LSTM_Py_Backend_v2/data/dataset_builder.py::FEATURES). Dung o day de
# main_api.py (serving) build dung 1 dong feature-vector tu du lieu live, khop
# chinh xac voi cot da train -- neu lech thu tu/lech feature se sai ket qua
# ma khong bao loi (silent bug).
FEATURES = [
    "rain", "rain_3h", "rain_6h", "rain_12h", "rain_24h",
    "rain_48h", "rain_72h", "rain_96h", "rain_120h", "rain_168h",
    "rain_intensity", "rain_12h_std", "rain_24h_max",
    "rain_lag_1", "rain_lag_3", "rain_lag_6", "rain_lag_12", "rain_lag_24",
    "inflow", "inflow_prev", "inflow_diff", "inflow_diff_2",
    "inflow_3h_avg", "inflow_6h_avg", "inflow_12h_avg",
    "inflow_24h_avg", "inflow_48h_avg", "inflow_rising",
    "rain_inflow_interaction", "soil_moisture_x_inflow",
    "water_level", "outflow", "Z_diff", "Z_24h_avg", "outflow_diff", "Q_ratio",
    "temperature", "relative_humidity", "pressure", "et0", "wind_speed",
    "hour_sin", "hour_cos", "doy_sin", "doy_cos", "month_sin", "month_cos",
]  # 47 features


def _find_dataset_dirs() -> dict:
    """Tra ve {reservoir_key: folder_path chua v2_X_hindcast.npy}."""
    for local_root in _LOCAL_CANDIDATES:
        if os.path.isdir(local_root):
            found = {}
            for name in os.listdir(local_root):
                p = os.path.join(local_root, name)
                if os.path.exists(os.path.join(p, "v2_X_hindcast.npy")):
                    found[name] = p
            if found:
                print(f"[data] Dung nguon local: {local_root}/ ({len(found)} ho)")
                return found

    kaggle_root = "/kaggle/input"
    if os.path.isdir(kaggle_root):
        found = {}
        for root, _, files in os.walk(kaggle_root):
            if "v2_X_hindcast.npy" in files:
                found[os.path.basename(root)] = root
        if found:
            print(f"[data] Dung nguon Kaggle input: {kaggle_root} ({len(found)} ho)")
            return found

    print(f"[data] Khong tim thay data local/Kaggle -> tai tu Hugging Face '{HF_REPO_ID}'...")
    from huggingface_hub import hf_hub_download
    import zipfile
    zip_path = hf_hub_download(repo_id=HF_REPO_ID, filename=HF_ZIP_FILENAME, repo_type="dataset")
    extract_dir = "/kaggle/working/datasets" if os.path.isdir("/kaggle/working") else "./_hf_datasets"
    os.makedirs(extract_dir, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(extract_dir)
    found = {}
    for root, _, files in os.walk(extract_dir):
        if "v2_X_hindcast.npy" in files:
            found[os.path.basename(root)] = root
    if not found:
        raise FileNotFoundError(
            "Khong tim thay v2_X_hindcast.npy o local, Kaggle input, lan Hugging Face."
        )
    print(f"[data] Da tai va giai nen tu Hugging Face ({len(found)} ho)")
    return found


def build_tabular_dataset():
    """
    Tra ve:
      X   (N, n_base_features + NUM_RESERVOIRS)  float32 -- da gom one-hot reservoir
      y   (N, HORIZON)                            float32 -- sqrt-space, da cap outlier
      rid (N,)                                    int64   -- reservoir idx (0..15)
      ts  (N,)                                     datetime64[s]
    """
    dirs = _find_dataset_dirs()
    key_to_idx = {info["name"].replace(" ", "_"): info["idx"] for _, info in RESERVOIRS.items()}

    X_list, y_list, rid_list, ts_list = [], [], [], []
    for key, path in sorted(dirs.items()):
        if key not in key_to_idx:
            print(f"  [SKIP] {key}: khong co trong config/reservoirs.py")
            continue
        idx = key_to_idx[key]
        X_hind = np.load(os.path.join(path, "v2_X_hindcast.npy"), mmap_mode="r")
        y = np.load(os.path.join(path, "v2_y.npy"))
        ts = np.load(os.path.join(path, "v2_timestamps.npy"))

        X_last = np.asarray(X_hind[:, -1, :], dtype=np.float32)  # dong cuoi = "hien tai"
        onehot = np.zeros((len(X_last), NUM_RESERVOIRS), dtype=np.float32)
        onehot[:, idx] = 1.0

        X_list.append(np.concatenate([X_last, onehot], axis=1))
        y_list.append(np.asarray(y, dtype=np.float32))
        rid_list.append(np.full(len(X_last), idx, dtype=np.int64))
        ts_list.append(ts)
        print(f"  [{key}] {len(X_last):,} samples")

    if not X_list:
        raise RuntimeError("Khong build duoc mau nao -- kiem tra lai thu muc dataset.")

    X = np.concatenate(X_list, axis=0)
    y = np.concatenate(y_list, axis=0)
    rid = np.concatenate(rid_list, axis=0)
    ts = np.concatenate(ts_list, axis=0)
    print(f"Total: {len(X):,} samples | X={X.shape} | y={y.shape}")
    return X, y, rid, ts


def split_by_date(ts: np.ndarray):
    """Fixed-date split -- xem config/settings.py, giong het LSTM_Py_Backend_v2
    (ReservoirLSTMConfig) va LSTM_Py_Backend/lstm_service (train_global.py) de
    so NSE cong bang giua ca 3 model tren cung 1 khoang test."""
    train_end_dt = np.datetime64(TRAIN_END, "s") + np.timedelta64(23, "h")
    val_start_dt = np.datetime64(VAL_START, "s")
    val_end_dt = np.datetime64(VAL_END, "s")
    test_start_dt = np.datetime64(TEST_START, "s")

    train_idx = np.where(ts <= train_end_dt)[0]
    val_idx = np.where((ts >= val_start_dt) & (ts < val_end_dt))[0]
    test_idx = np.where(ts >= test_start_dt)[0]
    return train_idx, val_idx, test_idx
