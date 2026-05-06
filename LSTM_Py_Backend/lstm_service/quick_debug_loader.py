import sys
import os
sys.path.append(os.path.join(os.getcwd(), "LSTM_Py_Backend", "lstm_service"))

from data.rain_matrix_loader import load_rain_matrix

try:
    print("Testing load_rain_matrix for A Vuong...")
    df = load_rain_matrix(1, days=5)
    print(f"Success! Loaded {len(df)} rows.")
    if not df.empty:
        print(df.tail())
except Exception as e:
    import traceback
    traceback.print_exc()
