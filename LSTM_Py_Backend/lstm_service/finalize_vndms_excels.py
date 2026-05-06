import pandas as pd
import glob
import os

def finalize_files():
    # Use glob to find the files directly in the current directory
    # This avoids casing or absolute path resolver bugs on Windows.
    files = glob.glob("VNDMS_Mua_Theo_Gio_*.xlsx")
    
    print(f"Found files via glob: {files}")
    
    for f_path in files:
        # We only want to process 2022 and 2023 with All_Stations sheet
        if "2022" not in f_path and "2023" not in f_path:
             continue
             
        print(f"Processing local file {f_path}...")
        try:
             # Check what sheet names are present in the file
             xl = pd.ExcelFile(f_path)
             sheets = xl.sheet_names
             print(f"Sheet names in {f_path}: {sheets}")

             if "All_Stations" not in sheets:
                  print(f"Warning: Sheet 'All_Stations' not found in {f_path}. Skipping.")
                  continue

             df = pd.read_excel(f_path, sheet_name="All_Stations")
             print(f"Total rows in {f_path} (All_Stations): {len(df)}")

             fil_df = df[df["Provinces"].fillna("").str.contains("Đà Nẵng|Quảng Nam", case=False)]
             print(f"Filtered rows for Đà Nẵng+Quảng Nam: {len(fil_df)}")

             if not fil_df.empty:
                  # Overwrite
                  bak_path = f_path + ".bak"
                  os.rename(f_path, bak_path)
                  with pd.ExcelWriter(f_path, engine="openpyxl") as writer:
                       fil_df.to_excel(writer, sheet_name="DaNang_QuangNam", index=False)
                  print(f"Successfully saved overwriting {f_path} with strictly filtered items.")
                  os.remove(bak_path)
             else:
                  print(f"Warning: Filtered data for {f_path} is empty! Not overwriting.")
        except Exception as e:
             print(f"Error processing {f_path}: {e}")

if __name__ == "__main__":
    finalize_files()
