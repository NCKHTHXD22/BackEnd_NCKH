# config/reservoirs.py
# Copy nguyen tu LSTM_Py_Backend_v2/config/reservoirs.py -- 16 ho Quang Nam/Da Nang.
# "idx" dung lam chi so one-hot reservoir cho model GLOBAL (RF dung chung 1 bo
# Quantile Regression Forest cho ca 16 ho, khac LSTM_Py_Backend_v2 train rieng
# tung ho -- xem README.md).

RESERVOIRS = {
    1: {"idx": 0, "name": "HO A VUONG", "lat": 15.815, "lon": 107.63, "river_basin": "Vu Gia"},
    2: {"idx": 1, "name": "HO DAK MI 4", "lat": 15.45285, "lon": 107.83250, "river_basin": "Vu Gia"},
    3: {"idx": 2, "name": "HO SONG BUNG 4", "lat": 15.726, "lon": 107.637, "river_basin": "Vu Gia"},
    4: {"idx": 3, "name": "HO SONG TRANH 2", "lat": 15.326, "lon": 108.125, "river_basin": "Thu Bồn"},
    7: {"idx": 4, "name": "HO SONG BUNG 4A", "lat": 15.765, "lon": 107.679, "river_basin": "Vu Gia"},
    8: {"idx": 5, "name": "HO SONG BUNG 5", "lat": 15.808, "lon": 107.7473, "river_basin": "Vu Gia"},
    9: {"idx": 6, "name": "HO SONG BUNG 2", "lat": 15.7145, "lon": 107.3970, "river_basin": "Vu Gia"},
    11: {"idx": 7, "name": "HO SONG BUNG 6", "lat": 15.82, "lon": 107.78, "river_basin": "Vu Gia"},
    12: {"idx": 8, "name": "HO SONG TRANH 3", "lat": 15.4445, "lon": 108.1430, "river_basin": "Thu Bồn"},
    13: {"idx": 9, "name": "HO ZA HUNG", "lat": 15.86005, "lon": 107.654, "river_basin": "Vu Gia"},
    14: {"idx": 10, "name": "HO DAK MI 3", "lat": 15.33, "lon": 107.81, "river_basin": "Vu Gia"},
    15: {"idx": 11, "name": "HO KHE DIEN", "lat": 15.71279, "lon": 107.92872, "river_basin": "Thu Bồn"},
    16: {"idx": 12, "name": "HO SONG CON 2", "lat": 15.90558, "lon": 107.8234, "river_basin": "Vu Gia"},
    17: {"idx": 13, "name": "HO SONG TRANH 4", "lat": 15.53666, "lon": 108.152, "river_basin": "Thu Bồn"},
    18: {"idx": 14, "name": "HO DAK MI 2", "lat": 15.23832, "lon": 107.8100, "river_basin": "Vu Gia"},
    19: {"idx": 15, "name": "HO DAK MI 4C", "lat": 15.4643, "lon": 107.92893, "river_basin": "Thu Bồn"},
}

NUM_RESERVOIRS = len(RESERVOIRS)
