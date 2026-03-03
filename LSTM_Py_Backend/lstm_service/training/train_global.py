import os
import torch
import numpy as np
from torch.utils.data import DataLoader, random_split
from tqdm import tqdm

from config.settings import *
from models.inflow_model import InflowForecastModel
from models.quantile_loss import quantile_loss


class FloodDataset(torch.utils.data.Dataset):

    def __init__(self):
        self.X_past = np.load("dataset_X_past.npy")
        self.X_future = np.load("dataset_X_future.npy")
        self.y = np.load("dataset_y.npy")
        self.rid = np.load("dataset_rid.npy")

    def __len__(self):
        return len(self.X_past)

    def __getitem__(self, idx):
        return (
            torch.tensor(self.X_past[idx]).float(),
            torch.tensor(self.X_future[idx]).float(),
            torch.tensor(self.y[idx]).float(),
            torch.tensor(self.rid[idx]).long()
        )


def compute_metrics(preds, targets):

    preds = preds[:, :, 1]
    preds = torch.expm1(preds)
    targets = torch.expm1(targets)

    mae = torch.mean(torch.abs(preds - targets)).item()
    rmse = torch.sqrt(torch.mean((preds - targets) ** 2)).item()

    mean_obs = torch.mean(targets)
    nse = 1 - torch.sum((preds - targets) ** 2) / \
              torch.sum((targets - mean_obs) ** 2)

    return mae, rmse, nse.item()


def train():

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print("Using device:", device)

    dataset = FloodDataset()

    # FIX: Use chronological split PER RESERVOIR to prevent Data Leakage, 
    # but ensure each reservoir is represented in both train and val!
    train_indices = []
    val_indices = []
    
    unique_rids = np.unique(dataset.rid)
    for r in unique_rids:
        idx_r = np.where(dataset.rid == r)[0]
        split_idx = int(0.9 * len(idx_r))
        train_indices.extend(idx_r[:split_idx])
        val_indices.extend(idx_r[split_idx:])
        
    print(f"Train size: {len(train_indices)}, Val size: {len(val_indices)}")
    
    train_dataset = torch.utils.data.Subset(dataset, train_indices)
    val_dataset = torch.utils.data.Subset(dataset, val_indices)

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE)

    model = InflowForecastModel(
        input_size=dataset.X_past.shape[2],
        hidden_size=HIDDEN_SIZE,
        horizon=HORIZON,
        quantiles=QUANTILES,
        num_reservoirs=NUM_RESERVOIRS
    ).to(device)

    optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=1e-4)

    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", patience=8, factor=0.5
    )

    best_val = float("inf")
    early_counter = 0
    patience = 20 # Increased patience for deeper training

    os.makedirs("artifacts", exist_ok=True)

    for epoch in range(EPOCHS):

        model.train()
        train_loss = 0

        for xb_past, xb_future, yb, rid in tqdm(train_loader, desc=f"Epoch {epoch+1}/{EPOCHS} [Train]"):

            xb_past, xb_future = xb_past.to(device), xb_future.to(device)
            yb, rid = yb.to(device), rid.to(device)

            optimizer.zero_grad()

            preds = model(xb_past, xb_future, rid)
            loss = quantile_loss(preds, yb, QUANTILES)

            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            train_loss += loss.item()

        train_loss /= len(train_loader)

        model.eval()
        val_loss = 0
        all_preds, all_targets = [], []

        with torch.no_grad():
            for xb_past, xb_future, yb, rid in tqdm(val_loader, desc=f"Epoch {epoch+1}/{EPOCHS} [Val]"):

                xb_past, xb_future = xb_past.to(device), xb_future.to(device)
                yb, rid = yb.to(device), rid.to(device)

                preds = model(xb_past, xb_future, rid)
                loss = quantile_loss(preds, yb, QUANTILES)

                val_loss += loss.item()

                all_preds.append(preds.cpu())
                all_targets.append(yb.cpu())

        val_loss /= len(val_loader)

        all_preds = torch.cat(all_preds)
        all_targets = torch.cat(all_targets)

        mae, rmse, nse = compute_metrics(all_preds, all_targets)

        scheduler.step(val_loss)

        print(
            f"Epoch {epoch+1} | "
            f"Train {train_loss:.4f} | "
            f"Val {val_loss:.4f} | "
            f"MAE {mae:.2f} | "
            f"RMSE {rmse:.2f} | "
            f"NSE {nse:.3f}"
        )

        if val_loss < best_val:
            best_val = val_loss
            torch.save(model.state_dict(), "artifacts/inflow_model.pt")
            early_counter = 0
            print("✔ Saved best model")
        else:
            early_counter += 1

        if early_counter >= patience:
            print("Early stopping triggered.")
            break

    print("Training complete.")