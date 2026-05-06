import mongoose from 'mongoose';
import axios from 'axios';
import exceljs from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ENV } from '../api/config/env.js';
import InflowLakeHistoryRepo from '../infrastructure/repositories/inflowLakeHistory.repo.js';
import InflowLakeRepo from '../infrastructure/repositories/inflowLake.repo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH = Buffer.from(`rfm2O3ciJ3aOJy1iA2SAfS3P_qwa:cklyddfdciGjQJGdtiPg936PDo8a`).toString('base64');

// Define the months to fetch based on flood events
const MONTHS_TO_FETCH = [
    { label: 'Tháng 10 - 2024', start: '2024-10-01T00:00:00.000Z', end: '2024-10-31T23:59:59.000Z' },
    { label: 'Tháng 9 - 2025', start: '2025-09-01T00:00:00.000Z', end: '2025-09-30T23:59:59.000Z' },
    { label: 'Tháng 10 - 2025', start: '2025-10-01T00:00:00.000Z', end: '2025-10-31T23:59:59.000Z' },
    { label: 'Tháng 11 - 2025', start: '2025-11-01T00:00:00.000Z', end: '2025-11-30T23:59:59.000Z' }
];

async function getToken() {
    try {
        console.log(`🔄 Fetching access token from Danang API...`);
        const res = await axios.post("https://apiv2.danang.gov.vn/oauth2/token", "grant_type=client_credentials", {
            headers: {
                'Authorization': `Basic ${AUTH}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 30000
        });
        return res.data.access_token;
    } catch (err) {
        console.error("❌ Token fetch error:", err.message);
        throw err;
    }
}

function roundToHour(dateStr) {
    const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(dateStr);
    const d = hasTimezone ? new Date(dateStr) : new Date(dateStr + '+07:00');
    d.setMinutes(0, 0, 0);
    return d;
}

async function fetchMonthData(token, lakeId, start, end) {
    console.log(`⏳ Fetching data for period: ${start} to ${end}`);
    try {
        const res = await axios.get("https://apiv2.danang.gov.vn/apiPCTT/1.0/baocaothuydiens_bieudo", {
            params: {
                thuydien_id: lakeId,
                ngaybatdau: start,
                ngayketthuc: end
            },
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 60000
        });

        // The API returns an array directly
        const data = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        console.log(`   -> Found ${data.length} records from API.`);
        return data;
    } catch (err) {
        console.error(`❌ Error fetching data:`, err.message);
        return [];
    }
}

async function processAndExport() {
    try {
        // Connect DB
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(ENV.MONGODB_URI);
        console.log('✅ Connected to MongoDB.');

        const token = await getToken();
        console.log('✅ Token acquired.');

        const lakes = await InflowLakeRepo.findAll();
        console.log(`🌊 Found ${lakes.length} lakes in Database.`);

        let globalTotalSaved = 0;
        
        // Ensure export directory exists
        const exportDir = path.resolve(path.join(__dirname, '../../history_exports'));
        import('fs').then(fs => {
            if (!fs.existsSync(exportDir)) {
                fs.mkdirSync(exportDir);
            }
        });

        for (const lake of lakes) {
            console.log(`\n========================================`);
            console.log(`🚀 PROCESSING LAKE: ${lake.name} (ID: ${lake.Id_Lake})`);
            console.log(`========================================`);

            const workbook = new exceljs.Workbook();
            workbook.creator = 'System';
            workbook.created = new Date();

            let lakeTotalSaved = 0;

            for (const period of MONTHS_TO_FETCH) {
                const rawData = await fetchMonthData(token, lake.Id_Lake, period.start, period.end);
                
                // Create Excel Sheet
                const sheet = workbook.addWorksheet(period.label);
                sheet.columns = [
                    { header: 'Thời gian thực tế', key: 'thoigianxa', width: 25 },
                    { header: 'Thời gian làm tròn (Mốc giờ)', key: 'timestamp', width: 25 },
                    { header: 'Mực nước (m)', key: 'htl', width: 15 },
                    { header: 'Q đến (m³/s)', key: 'qvao', width: 15 },
                    { header: 'Q xả tổng (m³/s)', key: 'luuluongxa', width: 18 },
                    { header: 'Q nhà máy (m³/s)', key: 'q_turbine', width: 18 },
                    { header: 'Q xả tràn (m³/s)', key: 'q_spillway', width: 18 }
                ];
                
                sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
                sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };

                if (!rawData || rawData.length === 0) {
                    console.log(`   -> No data to process for ${period.label}`);
                    continue;
                }

                const docsToUpsert = [];
                for (const record of rawData) {
                    const dateToParse = record.thoigianxa || record.thoigian;
                    if (!dateToParse) continue;

                    const roundedTime = roundToHour(dateToParse);
                    const timeKey = roundedTime.toISOString();

                    const doc = {
                        Id_Lake: lake.Id_Lake,
                        lakeName: lake.name,
                        qvao: record.qvao || 0,
                        luuluongxa: record.luuluongxa || 0,
                        q_turbine: record.luuluongchayMay ?? record.q_turbine ?? record.q_may ?? 0,
                        q_spillway: record.luuluongquatran ?? record.q_spillway ?? record.q_tran ?? 0,
                        htl: record.htl || 0,
                        timestamp: roundedTime
                    };

                    const existingIndex = docsToUpsert.findIndex(d => d.timestamp.toISOString() === timeKey);
                    if (existingIndex >= 0) {
                        docsToUpsert[existingIndex] = doc;
                    } else {
                        docsToUpsert.push(doc);
                    }

                    sheet.addRow({
                        thoigianxa: dateToParse,
                        timestamp: roundedTime.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
                        htl: doc.htl,
                        qvao: doc.qvao,
                        luuluongxa: doc.luuluongxa,
                        q_turbine: doc.q_turbine,
                        q_spillway: doc.q_spillway
                    });
                }

                if (docsToUpsert.length > 0) {
                    console.log(`   -> Upserting ${docsToUpsert.length} aggregated hourly records to MongoDB...`);
                    await InflowLakeHistoryRepo.bulkUpsert(docsToUpsert);
                    lakeTotalSaved += docsToUpsert.length;
                }
            }

            // Save Excel file for this lake
            const safeName = lake.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const exportPath = path.resolve(exportDir, `${safeName}_LichSu.xlsx`);
            await workbook.xlsx.writeFile(exportPath);
            console.log(`   ✅ Xuất file Excel thành công: ${exportPath}`);
            globalTotalSaved += lakeTotalSaved;
        }

        console.log(`\n🎉 HOÀN THÀNH! Đã đồng bộ tổng cộng ${globalTotalSaved} bản ghi giờ cho tất cả các hồ!`);
        
    } catch (err) {
        console.error("❌ Lỗi toàn cục:", err);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 Disconnected MongoDB.");
        process.exit(0);
    }
}

processAndExport();
