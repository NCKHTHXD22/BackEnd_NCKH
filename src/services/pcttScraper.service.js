/**
 * 🌐 pcttScraper.service.js
 *
 * Cào dữ liệu thủy văn hồ chứa từ trang pctt.danang.gov.vn
 * Dùng Puppeteer (tự bundle Chromium, chạy được trên Render với --no-sandbox).
 *
 * Nguồn:
 *  - https://pctt.danang.gov.vn/so-lieu/thuy-dien/a-vuong-sb4-dm4-st2
 *  - https://pctt.danang.gov.vn/so-lieu/thuy-dien/sb4a-sb5-sb6-st3-sb2
 *  - https://pctt.danang.gov.vn/so-lieu/thuy-dien/cac-ho-khac
 *
 * Mỗi hàng dữ liệu trả về:
 *  { Id_Lake, htl, qvao, q_turbine, q_spillway, luuluongxa, timestamp }
 */

import puppeteer from 'puppeteer';

const LAKE_MAPPING = {
    1:  { page: 0, htlCol: 2,  qvaoCol: 3,  qMayCol: 4,  qTranCol: 5  },  // A Vương
    2:  { page: 0, htlCol: 6,  qvaoCol: 7,  qMayCol: 8,  qTranCol: 9  },  // Đắk Mi 4
    3:  { page: 0, htlCol: 10, qvaoCol: 11, qMayCol: 12, qTranCol: 13 },  // Sông Bung 4
    4:  { page: 0, htlCol: 15, qvaoCol: 16, qMayCol: 17, qTranCol: 18 },  // Sông Tranh 2

    7:  { page: 1, htlCol: 2,  qvaoCol: 3,  qMayCol: 4,  qTranCol: 5  },  // Sông Bung 4A
    8:  { page: 1, htlCol: 6,  qvaoCol: 7,  qMayCol: 8,  qTranCol: 9  },  // Sông Bung 5
    11: { page: 1, htlCol: 10, qvaoCol: 11, qMayCol: 12, qTranCol: 13 },  // Sông Bung 6
    12: { page: 1, htlCol: 14, qvaoCol: 15, qMayCol: 16, qTranCol: 17 },  // Sông Tranh 3
    9:  { page: 1, htlCol: 18, qvaoCol: 19, qMayCol: 20, qTranCol: 21 },  // Sông Bung 2

    13: { page: 2, htlCol: 2,  qvaoCol: 3,  qMayCol: 4,  qTranCol: 5  },  // Za Hưng
    14: { page: 2, htlCol: 6,  qvaoCol: 7,  qMayCol: 8,  qTranCol: 9  },  // Đắk Mi 3
    15: { page: 2, htlCol: 10, qvaoCol: 11, qMayCol: 12, qTranCol: 13 },  // Khe Diên
    16: { page: 2, htlCol: 14, qvaoCol: 15, qMayCol: 16, qTranCol: 17 },  // Sông Kôn 2
    17: { page: 2, htlCol: 18, qvaoCol: 19, qMayCol: 20, qTranCol: 21 },  // Sông Tranh 4
    19: { page: 2, htlCol: 22, qvaoCol: 23, qMayCol: 24, qTranCol: 25 },  // Đắk Mi 4C
};

const PAGE_URLS = [
    'https://pctt.danang.gov.vn/so-lieu/thuy-%C4%91ien/a-vuong-sb4-%C4%91m4-st2',
    'https://pctt.danang.gov.vn/so-lieu/thuy-%C4%91ien/sb4a-sb5-sb6-st3-sb2',
    'https://pctt.danang.gov.vn/so-lieu/thuy-%C4%91ien/cac-ho-khac',
];

function parseVNNumber(str) {
    if (!str || str.trim() === '') return null;
    const num = parseFloat(str.trim().replace(',', '.'));
    return isNaN(num) ? null : num;
}

function parseVNDateTime(dateStr, timeStr) {
    try {
        const [day, month, year] = dateStr.trim().split('/');
        const [hour, minute] = (timeStr || '00:00').trim().split(':');
        return new Date(`${year}-${month}-${day}T${hour}:${minute}:00+07:00`);
    } catch {
        return new Date();
    }
}

async function scrapePageRows(page, url) {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Chờ bảng dữ liệu load xong — thử lần lượt với các timeout tăng dần
    let rows = [];
    for (const waitMs of [3000, 5000, 8000]) {
        await new Promise(r => setTimeout(r, waitMs));

        rows = await page.evaluate(() => {
            // Lấy tất cả tables, tìm bảng có nhiều hàng nhất (bảng dữ liệu)
            const tables = document.querySelectorAll('table');
            let bestTable = null;
            let bestCount = 0;
            tables.forEach(tbl => {
                const rowCount = tbl.querySelectorAll('tr').length;
                if (rowCount > bestCount) { bestCount = rowCount; bestTable = tbl; }
            });

            // Fallback: dùng index 9 nếu không tìm được bảng lớn
            const tbl = (bestCount > 5 ? bestTable : null) || document.querySelectorAll('table')[9];
            if (!tbl) return [];

            const result = [];
            tbl.querySelectorAll('tr').forEach((tr, rIdx) => {
                if (rIdx < 3) return; // bỏ 3 hàng header
                const cells = tr.querySelectorAll('td');
                if (cells.length < 2) return;
                result.push(Array.from(cells).map(c => c.innerText.trim()));
            });
            return result;
        });

        if (rows.length > 0) break; // có data rồi, dừng chờ
        console.log(`  ⏳ [SCRAPER] Chờ thêm ${waitMs}ms cho trang load...`);
    }

    return rows;
}

class PcttScraperService {
    /**
     * Tìm Chromium executable — Puppeteer bundled hoặc system path trên Linux
     */
    async _getExecutablePath() {
        // Ưu tiên env var (set trong Render dashboard nếu cần)
        if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;

        // System Chromium paths phổ biến trên Ubuntu/Debian (Render chạy Ubuntu)
        const { existsSync } = await import('fs');
        const systemPaths = [
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
        ];
        for (const p of systemPaths) {
            if (existsSync(p)) {
                console.log(`🔍 [SCRAPER] Dùng system Chromium: ${p}`);
                return p;
            }
        }

        // Để Puppeteer tự tìm bundled Chrome (mặc định)
        return undefined;
    }

    async scrapeAllLakes() {
        const results = new Map();

        try {
            const executablePath = await this._getExecutablePath();
            // KHÔNG mở trình duyệt ở đây nữa để tránh tốn RAM

            // Fetch 3 trang tuần tự, mỗi trang dùng một trình duyệt riêng để đảm bảo ổn định tuyệt đối
            console.log('🌐 [SCRAPER] Đang tải các trang PCTT tuần tự (Isolated Browser)...');
            const pageRowsCache = [];
            for (let i = 0; i < PAGE_URLS.length; i++) {
                const url = PAGE_URLS[i];
                let singleBrowser = null;
                try {
                    console.log(`  🕒 Đang cào Trang ${i + 1}: ${url}`);
                    singleBrowser = await puppeteer.launch({
                        headless: true,
                        executablePath: await this._getExecutablePath(),
                        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
                    });
                    const p = await singleBrowser.newPage();
                    const rows = await scrapePageRows(p, url);
                    console.log(`  ✔ Trang ${i + 1} hoàn tất: ${rows.length} hàng`);
                    pageRowsCache.push(rows);
                } catch (err) {
                    console.error(`  ❌ Trang ${i + 1} (${url}) lỗi: ${err.message}`);
                    pageRowsCache.push([]);
                } finally {
                    if (singleBrowser) await singleBrowser.close();
                }
            }

            // Parse từng hồ
            for (const [lakeIdStr, mapping] of Object.entries(LAKE_MAPPING)) {
                const lakeId = parseInt(lakeIdStr);
                const { page: pageIdx, htlCol, qvaoCol, qMayCol, qTranCol } = mapping;
                const rows = pageRowsCache[pageIdx] || [];
                const lakeData = [];

                for (const row of rows) {
                    const htl = parseVNNumber(row[htlCol]);
                    if (htl === null || htl <= 0) continue;

                    const qvao       = parseVNNumber(row[qvaoCol])  ?? 0;
                    const q_turbine  = parseVNNumber(row[qMayCol])  ?? 0;
                    const q_spillway = parseVNNumber(row[qTranCol]) ?? 0;
                    const luuluongxa = q_turbine + q_spillway;
                    const timestamp  = parseVNDateTime(row[0], row[1]);

                    lakeData.push({ htl, qvao, q_turbine, q_spillway, luuluongxa, timestamp });
                }

                if (lakeData.length > 0) {
                    results.set(lakeId, lakeData);
                    console.log(`  ✔ Hồ ${lakeId}: ${lakeData.length} bản ghi`);
                }
            }
        } catch (err) {
            console.error('❌ [SCRAPER] Lỗi:', err.message);
        } finally {
            // Đã đóng browser trong từng vòng lặp ở trên
        }

        return results;
    }
}

export default new PcttScraperService();
