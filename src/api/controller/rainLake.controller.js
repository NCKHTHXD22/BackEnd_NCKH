import rainLakeService from '../../services/rainLake.service.js';

/**
 * GET /api/rain-lake
 * Lấy danh sách tất cả hồ
 */
export const getAll = async (req, res, next) => {
  try {
    const data = await rainLakeService.getAll();
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

    const data = await rainLakeService.getByLakeId(Id_Lake);

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
    rainLakeService.updateAllLakeSumDepth().catch(err => {
      console.error('❌ Sync RainLake error:', err.message);
    });
  } catch (err) {
    next(err);
  }
};
