# scaler_utils.py
import joblib
import numpy as np
from sklearn.preprocessing import StandardScaler


class GlobalScaler:

    def __init__(self):
        self.scaler = StandardScaler()

    def fit_transform(self, X):
        B, T, F = X.shape
        # Dung partial_fit theo chunk de tranh OOM voi SEQ_LENGTH lon
        chunk = 5000  # so sample moi lan fit
        for i in range(0, B, chunk):
            X_chunk = X[i:i+chunk].reshape(-1, F)
            self.scaler.partial_fit(X_chunk)
        # Transform in-place theo chunk — tránh cấp phát thêm mảng 21+ GB
        for i in range(0, B, chunk):
            X[i:i+chunk] = self.scaler.transform(
                X[i:i+chunk].reshape(-1, F)
            ).reshape(-1, T, F)
        return X

    def transform(self, X):
        B,T,F = X.shape
        X2 = X.reshape(-1, F)
        X2 = self.scaler.transform(X2)
        return X2.reshape(B,T,F)

    def save(self, path):
        joblib.dump(self.scaler, path)

    def load(self, path):
        self.scaler = joblib.load(path)