// Route ghi/xóa dữ liệu quan trắc phải qua adminAuth. Lỗi cũ: DELETE /api/rain-history/delete-by-date xóa cả ngày mưa,
// POST/PUT/DELETE /api/water-level sửa ngưỡng báo động và GET /api/forecast-history/utils/drop-old-collection xóa
// collection – đều không cần đăng nhập. Chạy: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminAuth } from '../src/api/middlewares/admin.middleware.js';
import rainHistory from '../src/api/routes/rainHistory.routes.js';
import waterLevel from '../src/api/routes/waterLevel.routes.js';
import forecastHistory from '../src/api/routes/forecastHistory.routes.js';

const routes = router => router.stack.filter(l => l.route).map(l => ({
    path: l.route.path,
    methods: Object.keys(l.route.methods),
    guarded: l.route.stack.some(s => s.handle === adminAuth),
}));

test('route ghi/xóa rain-history và water-level yêu cầu adminAuth', () => {
    const open = [...routes(rainHistory), ...routes(waterLevel)]
        .filter(r => r.methods.some(m => m !== 'get') && !r.guarded)
        .map(r => `${r.methods.join(',')} ${r.path}`);
    assert.deepEqual(open, []);
});

test('không còn route GET xóa collection forecast-history', () => {
    assert.ok(!routes(forecastHistory).some(r => r.path.includes('drop')));
});
