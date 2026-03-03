# main_build_dataset.py
from data.dataset_builder import build_global_dataset

if __name__ == "__main__":
    build_global_dataset(days=1200) # 3.3 Years of data for high accuracy