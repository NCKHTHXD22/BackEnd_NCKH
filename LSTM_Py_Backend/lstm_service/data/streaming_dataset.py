#streaming_dataset.py
import torch
from torch.utils.data import Dataset
import numpy as np


class FloodDataset(Dataset):

    def __init__(self, X_path, y_path, rid_path):
        self.X = np.load(X_path, mmap_mode="r")
        self.y = np.load(y_path, mmap_mode="r")
        self.rid = np.load(rid_path, mmap_mode="r")

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        return (
            torch.tensor(self.X[idx]).float(),
            torch.tensor(self.y[idx]).float(),
            torch.tensor(self.rid[idx]).long()
        )