# scaler_utils.py
import joblib
import numpy as np
from sklearn.preprocessing import StandardScaler


class GlobalScaler:

    def __init__(self):
        self.scaler = StandardScaler()

    def fit_transform(self, X):
        B,T,F = X.shape
        X2 = X.reshape(-1, F)
        X2 = self.scaler.fit_transform(X2)
        return X2.reshape(B,T,F)

    def transform(self, X):
        B,T,F = X.shape
        X2 = X.reshape(-1, F)
        X2 = self.scaler.transform(X2)
        return X2.reshape(B,T,F)

    def save(self, path):
        joblib.dump(self.scaler, path)

    def load(self, path):
        self.scaler = joblib.load(path)