# main_pretrain.py
"""
Entry point: pretrain 1 model "nền" trên dữ liệu GỘP ẢO của tất cả hồ đã build
(torch.utils.data.ConcatDataset — không ghi bản sao ra đĩa, xem
training/pretrain_pooled.py).

Cách dùng:
    python main_pretrain.py                    # tự quét datasets/<Ten_Ho>/ đã build
    python main_pretrain.py --epochs 50         # override epochs

Yêu cầu: đã build xong datasets/<Ten_Ho>/v2_*.npy cho các hồ muốn gộp
(main_build_dataset.py --all --legacy-v1).

Sau khi pretrain xong (artifacts/_POOLED_PRETRAIN/pretrain_pooled.pt), fine-tune
riêng từng hồ:
    python main_train.py --rid 2 --init-checkpoint artifacts/_POOLED_PRETRAIN/pretrain_pooled.pt --lr 1e-4 --epochs 40
"""
import argparse
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from training.pretrain_pooled import pretrain_pooled


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=None)
    args = parser.parse_args()
    pretrain_pooled(epochs=args.epochs)


if __name__ == "__main__":
    main()
