"""
Entry point: Training HueLSTM.

Chạy: python main_train.py
       python main_train.py --config example_configs/hue_default.yml
       python main_train.py --head cmal --epochs 100
"""

import argparse
import os
import sys

from config.settings import HueLSTMConfig
from training.train import train


def main():
    parser = argparse.ArgumentParser(description="Train HueLSTM — 7-day flood forecast")
    parser.add_argument("--config",   type=str, default=None,       help="Path to YAML config")
    parser.add_argument("--data-dir", type=str, default=".",        help="Dir chứa hue_*.npy")
    parser.add_argument("--head",     type=str, default=None,       help="quantile | cmal")
    parser.add_argument("--epochs",   type=int, default=None)
    parser.add_argument("--batch",    type=int, default=None)
    parser.add_argument("--lr",       type=float, default=None)
    parser.add_argument("--hidden",   type=int, default=None)
    args = parser.parse_args()

    if args.config:
        cfg = HueLSTMConfig.from_yaml(args.config)
        print(f"Config loaded from: {args.config}")
    else:
        cfg = HueLSTMConfig()
        print("Using default HueLSTMConfig")

    # CLI overrides
    if args.head:    cfg.head = args.head
    if args.epochs:  cfg.epochs = args.epochs
    if args.batch:   cfg.batch_size = args.batch
    if args.lr:      cfg.lr = args.lr
    if args.hidden:  cfg.hidden_size = args.hidden

    print(f"Model: {cfg.model}")
    print(f"Head: {cfg.head} | Hidden: {cfg.hidden_size} | Epochs: {cfg.epochs}")
    print(f"Hindcast: {cfg.hindcast_length}h | Forecast: {cfg.forecast_length}h")
    print(f"Quantiles: {cfg.quantiles}")

    train(cfg, data_dir=args.data_dir)


if __name__ == "__main__":
    main()
