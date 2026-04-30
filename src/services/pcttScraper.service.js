/**
 * 🌐 pcttScraper.service.js
 * 
 * Dịch vụ cào dữ liệu thủy văn hồ chứa từ trang pctt.danang.gov.vn
 * Được dùng làm FALLBACK khi API chính (apiv2.danang.gov.vn) bị sập.
 * 
 * Nguồn:
 *  - https://pctt.danang.gov.vn/so-lieu/thuy-dien/a-vuong-sb4-dm4-st2
 *  - https://pctt.danang.gov.vn/so-lieu/thuy-dien/sb4a-sb5-sb6-st3-sb2
 *  - https://pctt.danang.gov.vn/so-lieu/thuy-dien/cac-ho-khac
 * 
 * Cấu trúc dữ liệu mỗi hàng trả về:
 *  { Id_Lake, htl, qvao, q_turbine, q_spillway, luuluongxa, timestamp }
 */

import { chromium } from 'playwright';

// ============================================================
//  MAPPING: Id_Lake  →  { page, colStart }
//  Mỗi hồ chiếm 4 cột liên tiếp trong hàng data (từ row index 3 trở đi):
//    colStart + 0 = htl (mực nước)
//    colStart + 1 = qvao (lưu lượng đến)
//    colStart + 2 = q_turbine (chạy máy)
//    colStart + 3 = q_spillway (qua tràn)
//  luuluongxa = q_turbine + q_spillway
// ============================================================
const LAKE_MAPPING = {
    // Trang 1: A Vương, Đăk Mi 4, Sông Bung 4, Sông Tranh 2
    // Row data: [date, time, htl_av, qden_av, qmay_av, qtran_av, htl_dm, qden_dm, qmay_dm, qtran_dm, htl_sb4, qden_sb4, qmay_sb4, qtran_sb4, QVeVuGia, htl_st2, qden_st2, qmay_st2, qtran_st2, QVeThuBon]
    1:  { page: 0, htlCol: 2,  qvaoCol: 3,  qMayCol: 4,  qTranCol: 5  },  // A Vương
    2:  { page: 0, htlCol: 6,  qvaoCol: 7,  qMayCol: 8,  qTranCol: 9  },  // Đăk Mi 4
    3:  { page: 0, htlCol: 10, qvaoCol: 11, qMayCol: 12, qTranCol: 13 },  // Sông Bung 4
    4:  { page: 0, htlCol: 15, qvaoCol: 16, qMayCol: 17, qTranCol: 18 },  // Sông Tranh 2 (skip cột Q về Vu Gia)

    // Trang 2: Sông Bung 4a, Sông Bung 5, Sông Bung 6, Sông Tranh 3, Sông Bung 2
    7:  { page: 1, htlCol: 2,  qvaoCol: 3,  qMayCol: 4,  qTranCol: 5  },  // Sông Bung 4A
    8:  { page: 1, htlCol: 6,  qvaoCol: 7,  qMayCol: 8,  qTranCol: 9  },  // Sông Bung 5
    11: { page: 1, htlCol: 10, qvaoCol: 11, qMayCol: 12, qTranCol: 13 },  // Sông Bung 6
    12: { page: 1, htlCol: 14, qvaoCol: 15, qMayCol: 16, qTranCol: 17 },  // Sông Tranh 3
    9:  { page: 1, htlCol: 18, qvaoCol: 19, qMayCol: 20, qTranCol: 21 },  // Sông Bung 2

    // Trang 3: Za Hưng, Đăk Mi 3, Khe Diên, Sông Kôn 2, Sông Tranh 4, Đăk Mi 2, Đăk Mi 4C
    13: { page: 2, htlCol: 2,  qvaoCol: 3,  qMayCol: 4,  qTranCol: 5  },  // Za Hưng
    14: { page: 2, htlCol: 6,  qvaoCol: 7,  qMayCol: 8,  qTranCol: 9  },  // Đăk Mi 3
    15: { page: 2, htlCol: 10, qvaoCol: 11, qMayCol: 12, qTranCol: 13 },  // Khe Diên
    16: { page: 2, htlCol: 14, qvaoCol: 15, qMayCol: 16, qTranCol: 17 },  // Sông Kôn 2
    17: { page: 2, htlCol: 18, qvaoCol: 19, qMayCol: 20, qTranCol: 21 },  // Sông Tranh 4
    19: { page: 2, htlCol: 22, qvaoCol: 23, qMayCol: 24, qTranCol: 25 },  // Đăk Mi 4C
};

const PAGE_URLS = [
    'https://pctt.danang.gov.vn/so-lieu/thuy-%C4%91ien/a-vuong-sb4-%C4%91m4-st2',
    'https://pctt.danang.gov.vn/so-lieu/thuy-%C4%91ien/sb4a-sb5-sb6-st3-sb2',
    'https://pctt.danang.gov.vn/so-lieu/thuy-%C4%91ien/cac-ho-khac',
];

/**
 * Parse giá trị số từ chuỗi tiếng Việt (dấu phẩy = dấu thập phân)
 * VD: "368,16" → 368.16, "" → null
 */
function parseVNNumber(str) {
    if (!str || str.trim() === '') return null;
    const cleaned = str.trim().replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

/**
 * Parse ngày giờ từ chuỗi "dd/mm/yyyy" và "hh:mm"
 * Trả về Date theo giờ VN (UTC+7)
 */
function parseVNDateTime(dateStr, timeStr) {
    try {
        // dateStr = "30/04/2026", timeStr = "19:00"
        const [day, month, year] = dateStr.split('/');
        const [hour, minute] = (timeStr || '00:00').split(':');
        // Tạo ISO string với timezone +07:00
        const iso = `${year}-${month}-${day}T${hour}:${minute}:00+07:00`;
        return new Date(iso);
    } catch {
        return new Date();
    }
}

/**
 * Scrape data từ một trang, trả về mảng rows (mỗi row là array of strings)
 */
async function scrapePageRows(page, url) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);

    return await page.evaluate(() => {
        // Bảng dữ liệu luôn ở index 9
        const tbl = document.querySelectorAll('table')[9];
        if (!tbl) return [];
        const rows = tbl.querySelectorAll('tr');
        const result = [];
        rows.forEach((tr, rIdx) => {
            if (rIdx < 3) return; // bỏ qua 3 hàng header
            const cells = tr.querySelectorAll('td');
            if (cells.length < 2) return;
            result.push(Array.from(cells).map(c => c.innerText.trim()));
        });
        return result;
    });
}

class PcttScraperService {
    /**
     * Cào dữ liệu tất cả hồ từ trang pctt.danang.gov.vn
     * Trả về Map<lakeId, Array<{ htl, qvao, q_turbine, q_spillway, luuluongxa, timestamp }>>
     */
    async scrapeAllLakes() {
        const results = new Map();
        let browser = null;

        try {
            browser = await chromium.launch({ headless: true });
            const page = await browser.newPage();

            const pageRowsCache = [null, null, null];

            for (const [lakeIdStr, mapping] of Object.entries(LAKE_MAPPING)) {
                const lakeId = parseInt(lakeIdStr);
                const { page: pageIdx, htlCol, qvaoCol, qMayCol, qTranCol } = mapping;

                try {
                    if (!pageRowsCache[pageIdx]) {
                        console.log(`🌐 [SCRAPER] Đang tải các trang song song...`);
                        const tasks = PAGE_URLS.map(async (url, idx) => {
                            const p = await browser.newPage();
                            try {
                                const r = await scrapePageRows(p, url);
                                return { idx, rows: r };
                            } finally {
                                await p.close();
                            }
                        });
                        const resultsArr = await Promise.all(tasks);
                        resultsArr.forEach(r => { pageRowsCache[r.idx] = r.rows; });
                    }

                    const rows = pageRowsCache[pageIdx];
                    const lakeData = [];

                    for (const row of rows) {
                        const htl = parseVNNumber(row[htlCol]);
                        // Nếu htl là null hoặc <= 0, có thể hàng này không có dữ liệu cho hồ này
                        if (htl === null || htl <= 0) continue;

                        const qvao = parseVNNumber(row[qvaoCol]) ?? 0;
                        const q_turbine = parseVNNumber(row[qMayCol]) ?? 0;
                        const q_spillway = parseVNNumber(row[qTranCol]) ?? 0;
                        const luuluongxa = q_turbine + q_spillway;
                        const timestamp = parseVNDateTime(row[0], row[1]);

                        lakeData.push({ htl, qvao, q_turbine, q_spillway, luuluongxa, timestamp });
                    }

                    if (lakeData.length > 0) {
                        results.set(lakeId, lakeData);
                        console.log(`  ✔ Hồ ${lakeId}: Lấy được ${lakeData.length} bản ghi lịch sử`);
                    }
                } catch (err) {
                    console.error(`  ❌ Hồ ${lakeId}: Lỗi xử lý dữ liệu - ${err.message}`);
                }
            }
        } catch (err) {
            console.error('❌ [SCRAPER] Lỗi khởi tạo browser:', err.message);
        } finally {
            if (browser) await browser.close();
        }

        return results;
    }
}

export default new PcttScraperService();
