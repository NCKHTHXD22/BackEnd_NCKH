# data/tabular_dataset.py
"""
Doc du lieu tabular tu dataset LSTM_Py_Backend_v2 da build san (sliding-window
hindcast, xem LSTM_Py_Backend_v2/data/dataset_builder.py) -- KHONG con phu
thuoc Data_Tung_Ho_Ma_Tran_Rong/ (Excel goc) truc tiep.

Feature vector = dong CUOI CUNG cua hindcast window (= "hien tai", da chua
day du lag/rolling feature nen cua 240h qua khu) + oracle mua/khi tuong
tuong lai (X_nwp buoc dau tien) + one-hot reservoir.

Oracle rain (theo yeu cau phuong phap cua du an): "mua du bao" dua vao model
LA du lieu mua THUC TE da xay ra trong khoang tuong lai (khong phai du bao
that) -- model hoc quy luat mua->lu tu du lieu hoan chinh. Luc serving (xem
main_api.py), phan nay duoc thay bang du bao Open-Meteo that (khong con la
oracle nua, co sai so du bao thuc te) -- day la cach lam CHU DICH, giong het
LSTM_Py_Backend/v2 dang dung (X_future/X_nwp), khong phai loi train/serve
mismatch nhu ghi chu cu cua file nay tung noi.

Tim nguon du lieu theo thu tu uu tien:
  1. Local dev: ../LSTM_Py_Backend_v2/datasets/<Ten_Ho>/v2_*.npy
  2. Kaggle: /kaggle/input/**/v2_X_hindcast.npy (dataset da attach vao notebook)
  3. Hugging Face Hub: Anvo2004/dataset_all_lake (LUU Y: repo nay hien TRONG,
     khong co file zip that -- xem README.md. Fallback nay se loi neu ca local
     lan Kaggle input deu khong co, phai tu Add Input Dataset tren Kaggle.)
"""
import os
import numpy as np

from config.reservoirs import RESERVOIRS, NUM_RESERVOIRS
from config.settings import HF_REPO_ID, HF_ZIP_FILENAME

_LOCAL_CANDIDATES = [
    os.path.join("..", "LSTM_Py_Backend_v2", "datasets"),
    os.path.join("LSTM_Py_Backend_v2", "datasets"),
]

# Danh sach 47 feature hindcast (thu tu CHINH XAC khop cot cuoi cung cua
# v2_X_hindcast.npy -- xem LSTM_Py_Backend_v2/data/dataset_builder.py::FEATURES).
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

# 6 feature "tuong lai" (oracle luc train, du bao Open-Meteo luc serving) --
# lay dung buoc dau tien (t+1h) cua v2_X_nwp.npy, xem
# LSTM_Py_Backend_v2/data/dataset_builder.py::_build_nwp_window() /
# NWP_FEATURES. rain_fc_24h la tich luy mua tu t+1 den t+24 (ca cua so du
# bao), nen dung chung cho ca 24 model horizon (h+1..h+24) khong sai logic --
# giong cach LSTM dung 1 X_future cho ca 24 buoc output.
FUTURE_FEATURES = ["rain_fc", "rain_fc_3h", "rain_fc_6h", "rain_fc_24h", "temp_fc", "wind_fc"]

ALL_FEATURES = FEATURES + FUTURE_FEATURES  # 53 feature co so (chua tinh one-hot ho)


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
            "Khong tim thay v2_X_hindcast.npy o local, Kaggle input, lan Hugging Face "
            "(repo Anvo2004/dataset_all_lake hien khong co file zip that -- phai tu Add "
            "Input Dataset tren Kaggle, xem README.md)."
        )
    print(f"[data] Da tai va giai nen tu Hugging Face ({len(found)} ho)")
    return found


def build_tabular_dataset():
    """
    Tra ve:
      X   (N, 47 hindcast + 6 oracle-future + NUM_RESERVOIRS one-hot) float32
      y   (N, HORIZON)                                                 float32, sqrt-space
      rid (N,)                                                         int64, reservoir idx (0..15)
      ts  (N,)                                                         datetime64[s]
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
        X_nwp = np.load(os.path.join(path, "v2_X_nwp.npy"), mmap_mode="r")
        y = np.load(os.path.join(path, "v2_y.npy"))
        ts = np.load(os.path.join(path, "v2_timestamps.npy"))

        X_last = np.asarray(X_hind[:, -1, :], dtype=np.float32)   # dong cuoi hindcast = "hien tai"
        X_future = np.asarray(X_nwp[:, 0, :], dtype=np.float32)   # buoc dau tien cua cua so du bao (t+1h)
        onehot = np.zeros((len(X_last), NUM_RESERVOIRS), dtype=np.float32)
        onehot[:, idx] = 1.0

        X_list.append(np.concatenate([X_last, X_future, onehot], axis=1))
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
    print(f"Total: {len(X):,} samples | X={X.shape} (47 hindcast + 6 oracle-future + "
          f"{NUM_RESERVOIRS} one-hot) | y={y.shape}")
    return X, y, rid, ts


def split_60_20_20(ts: np.ndarray):
    """
    Split 60% train / 20% validation / 20% test THEO THOI GIAN (chronological,
    khong phai random) -- tranh data leakage (khong de mau tuong lai lot vao
    tap train khi mau qua khu nam trong test).

    Cutoff tinh theo % THOI GIAN da troi qua (khong phai % SO MAU), vi so mau
    khong deu tuyet doi giua cac thang (thang du/thang thieu ngay) -- % thoi
    gian moi la thu dung 60/20/20 theo dung nghia "60% khoang thoi gian dau
    dung de train".
    """
    t_min, t_max = ts.min(), ts.max()
    span = (t_max - t_min).astype("timedelta64[s]").astype(np.int64)
    cutoff_60 = t_min + np.timedelta64(int(span * 0.60), "s")
    cutoff_80 = t_min + np.timedelta64(int(span * 0.80), "s")

    train_idx = np.where(ts < cutoff_60)[0]
    val_idx = np.where((ts >= cutoff_60) & (ts < cutoff_80))[0]
    test_idx = np.where(ts >= cutoff_80)[0]
    print(f"[split 60/20/20] train <{cutoff_60} | val [{cutoff_60}, {cutoff_80}) | test >={cutoff_80}")
    return train_idx, val_idx, test_idx


# Mua lu Vu Gia - Thu Bon: thang 9 nam nay -> thang 1 nam sau (yeu cau uu tien
# bat dinh lu cua du an). Dung o training/train_rf.py, train_xgb.py de tang
# trong so mau trong mua lu, cong them trong so theo bien do dinh lu da co.
RAINY_SEASON_MONTHS = {9, 10, 11, 12, 1}
