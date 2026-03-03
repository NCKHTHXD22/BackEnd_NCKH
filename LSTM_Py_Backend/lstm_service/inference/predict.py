#predict.py
import torch
import numpy as np
from datetime import datetime, timedelta

from config.settings import *
from models.global_lstm import GlobalLSTM


def predict(reservoir_id, last_sequence):

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model = GlobalLSTM(
        input_size=last_sequence.shape[1],
        hidden_size=HIDDEN_SIZE,
        horizon=HORIZON,
        quantiles=QUANTILES,
        num_reservoirs=NUM_RESERVOIRS
    )

    model.load_state_dict(
        torch.load("artifacts/global_model.pt")
    )

    model.to(device)
    model.eval()

    with torch.no_grad():

        x = torch.tensor(
            last_sequence[np.newaxis, :, :]
        ).float().to(device)

        rid = torch.tensor([reservoir_id]).long().to(device)

        preds = model(x, rid)

    return preds.cpu().numpy()[0]