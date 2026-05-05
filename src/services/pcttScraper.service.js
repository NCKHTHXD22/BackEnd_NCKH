/**
 * 🌐 pcttScraper.service.js
 *
 * Cào dữ liệu thủy văn hồ chứa từ trang pctt.danang.gov.vn
 * Dùng axios + cheerio (không cần Chromium/Playwright).
 *
 * Nguồn:
 *  - https://pctt.danang.gov.vn/so-lieu/thuy-dien/a-vuong-sb4-dm4-st2
 *  - https://pctt.danang.gov.vn/so-lieu/thuy-dien/sb4a-sb5-sb6-st3-sb2
 *  - https://pctt.danang.gov.vn/so-lieu/thuy-dien/cac-ho-khac
 *
 * Mỗi hàng dữ liệu trả về:
 *  { Id_Lake, htl, qvao, q_turbine, q_spillway, luuluongxa, timestamp }
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

// ============================================================
//  MAPPING: Id_Lake → { page, colStart }
//  Trang 1: A Vương, Đắk Mi 4, Sông Bung 4, Sông Tranh 2
//  Trang 2: Sông Bung 4A, 5, 6, Sông Tranh 3, Sông Bung 2
//  Trang 3: Za Hưng, Đắk Mi 3, Khe Diên, Sông Kôn 2, Sông Tranh 4, Đắk Mi 4C
// ============================================================
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

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
    'Referer': 'https://pctt.danang.gov.vn/',
};

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

/**
 * Fetch một trang PCTT và trả về mảng rows (mỗi row là array of strings)
 * Dùng axios + cheerio, không cần browser
 */
async function scrapePageRows(url) {
    const response = await axios.get(url, { headers: HEADERS, timeout: 30000, responseEncoding: 'utf8' });
    const $ = cheerio.load(response.data);

    // Bảng dữ liệu luôn ở index 9
    const table = $('table').eq(9);
    const rows = [];

    table.find('tr').each((rIdx, tr) => {
        if (rIdx < 3) return; // bỏ qua 3 hàng header
        const cells = [];
        $(tr).find('td').each((_, td) => {
            cells.push($(td).text().trim());
        });
        if (cells.length >= 2) rows.push(cells);
    });

    return rows;
}

class PcttScraperService {
    /**
     * Cào dữ liệu tất cả hồ từ 3 trang pctt.danang.gov.vn (song song)
     * Trả về Map<lakeId, Array<{ htl, qvao, q_turbine, q_spillway, luuluongxa, timestamp }>>
     */
    async scrapeAllLakes() {
        const results = new Map();

        // Fetch 3 trang song song
        let pageRowsCache;
        try {
            console.log('🌐 [SCRAPER] Đang tải 3 trang PCTT song song...');
            const fetches = await Promise.all(
                PAGE_URLS.map(url => scrapePageRows(url).catch(err => {
                    console.error(`  ❌ [SCRAPER] Lỗi fetch ${url}: ${err.message}`);
                    return [];
                }))
            );
            pageRowsCache = fetches;
            console.log(`  ✔ Trang 1: ${fetches[0].length} hàng | Trang 2: ${fetches[1].length} hàng | Trang 3: ${fetches[2].length} hàng`);
        } catch (err) {
            console.error('❌ [SCRAPER] Lỗi fetch trang:', err.message);
            return results;
        }

        // Parse từng hồ từ cache
        for (const [lakeIdStr, mapping] of Object.entries(LAKE_MAPPING)) {
            const lakeId = parseInt(lakeIdStr);
            const { page: pageIdx, htlCol, qvaoCol, qMayCol, qTranCol } = mapping;
            const rows = pageRowsCache[pageIdx] || [];
            const lakeData = [];

            for (const row of rows) {
                const htl = parseVNNumber(row[htlCol]);
                if (htl === null || htl <= 0) continue;

                const qvao      = parseVNNumber(row[qvaoCol])  ?? 0;
                const q_turbine = parseVNNumber(row[qMayCol])  ?? 0;
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

        return results;
    }
}

export default new PcttScraperService();
