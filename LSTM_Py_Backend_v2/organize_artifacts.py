import os
import sys
import shutil

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


ROOT = os.path.dirname(os.path.abspath(__file__))
ARTIFACTS_DIR = os.path.join(ROOT, "artifacts")

def organize():
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)
    items = os.listdir(ROOT)
    moved_count = 0

    for item in items:
        if (item.startswith("HO_") or item.startswith("_BRANCH_")) and item != "artifacts":
            src = os.path.join(ROOT, item)
            dst = os.path.join(ARTIFACTS_DIR, item)

            if os.path.isdir(src):
                if os.path.exists(dst):
                    # Copy contents inside src into dst
                    for sub in os.listdir(src):
                        sub_src = os.path.join(src, sub)
                        sub_dst = os.path.join(dst, sub)
                        if os.path.isdir(sub_src):
                            if os.path.exists(sub_dst):
                                shutil.rmtree(sub_dst)
                            shutil.move(sub_src, sub_dst)
                        else:
                            shutil.copy2(sub_src, sub_dst)
                    shutil.rmtree(src)
                else:
                    shutil.move(src, dst)
                moved_count += 1
                print(f"  ✓ Gộp thư mục: {item} -> artifacts/{item}")

    print(f"\n✅ Đã gộp toàn bộ {moved_count} thư mục kết quả model vào thư mục chung: artifacts/")

if __name__ == "__main__":
    organize()
