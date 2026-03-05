import inflowLakeService from '../../services/inflowLake.service.js';

/**
 * GET /api/rain-lake
 * Lấy danh sách tất cả hồ
 */
export const getAll = async (req, res, next) => {
    try {
        const data = await inflowLakeService.getAll();
        res.json(data);
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/rain-lake/:Id_Lake
 * Lấy thông tin 1 hồ theo Id_Lake
 */
export const getByLakeId = async (req, res, next) => {
    try {
        const Id_Lake = Number(req.params.Id_Lake);

        if (Number.isNaN(Id_Lake)) {
            return res.status(400).json({ message: 'Id_Lake không hợp lệ' });
        }

        const data = await inflowLakeService.getByLakeId(Id_Lake);

        if (!data) {
            return res.status(404).json({ message: 'Không tìm thấy hồ' });
        }

        res.json(data);
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/rain-lake/sync-sumdepth
 * Force đồng bộ (chạy nền, KHÔNG chặn request)
 */
export const syncSumDepth = async (req, res, next) => {
    try {
        // trả response ngay, tránh timeout
        res.json({ message: '⏳ Đang đồng bộ sumDepth...' });

        // chạy nền
        inflowLakeService.updateAllLakeFromHistory().catch(err => {
            console.error('❌ Sync InflowLake error:', err.message);
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/rain-lake/sync-hydro
 * Force đồng bộ thông số thủy văn (inflow, outflow, htl from Danang API)
 */
export const syncHydroData = async (req, res, next) => {
    try {
        res.json({ message: '⏳ Đang đồng bộ thông số thủy văn các hồ...' });

        // chạy nền
        inflowLakeService.syncAllLakeHydroData().catch(err => {
            console.error('❌ Sync Hydro data error:', err.message);
        });
    } catch (err) {
        next(err);
    }
};
