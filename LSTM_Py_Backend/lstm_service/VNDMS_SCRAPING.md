# VNDMS PCTT scraping

Trang `https://vndms.dmc.gov.vn/home/datapctt#two` co the tra ve trang
khong co quyen neu tai khoan chua duoc cap quyen cho chuc nang nay. Khong
dua tai khoan vao source code; dat trong `.env`:

```env
VNDMS_USERNAME=your_username
VNDMS_PASSWORD=your_password
# Hoac dung cookie da dang nhap tu trinh duyet:
# VNDMS_COOKIE=.AspNetCore.Cookies=...
```

Chay tu thu muc `lstm_service`:

```powershell
python -X utf8 scrape_vndms_pctt.py --check
python -X utf8 scrape_vndms_pctt.py --download-page
python -X utf8 scrape_vndms_pctt.py --download-tabs
python -X utf8 scrape_vndms_pctt.py --download-grid-samples
python -X utf8 scrape_vndms_pctt.py --rain-month 2026-05 --length 100000
python -X utf8 scrape_vndms_pctt.py --rain-from-year 2022 --to-year 2026 --province-id 411 --length 100000
python -X utf8 scrape_vndms_pctt.py --water-level-year 2025 --basin-id 13 --length 10000
python -X utf8 scrape_vndms_pctt.py --hydropower-from-year 2022 --to-year 2026 --province-id 411 --reservoirs "Ta Trach,Binh Dien,Huong Dien" --length 10000
python -X utf8 scrape_vndms_pctt.py --hydropower-from-year 2022 --to-year 2026 --to-date "28/05/2026 23:59" --province-id 0 --basin-id 13 --reservoirs "A Vuong,Song Tranh 2,Song Bung 4,Dakmi4" --length 100000
python -X utf8 scrape_vndms_pctt.py --grid water-level --from-date "19/05/2026 00:00" --to-date "19/05/2026 23:00"
python -X utf8 scrape_vndms_pctt.py --endpoint "/some/protected/json" --params "{}"
python -X utf8 scrape_vndms_pctt.py --normalize-json ".\Rain Data\_raw_vndms_pctt\raw.json" --year 2026 --month 5
```

File Excel sau khi chuan hoa se duoc ghi vao:

```text
Rain Data/DATA_RAIN_YYYY/VNDMS_Mua_Theo_Gio_YYYY_MM.xlsx
```

Day la dung format ma `update_rain_idw_excel.py` va
`update_station_columns_excel.py` dang doc.
