// Hook tự tăng id của các entity phải chạy được với Mongoose 9 (không truyền `next`). Chạy: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Counter from '../src/core/entities/Counter.js';
import WaterLevelStation from '../src/core/entities/WaterLevelStation.js';
import FloodTower from '../src/core/entities/FloodTower.js';
import FloodWarning from '../src/core/entities/FloodWarning.js';

for (const Model of [WaterLevelStation, FloodTower, FloodWarning]) {
    test(`${Model.modelName}: hook pre('save') cấp id không lỗi`, async () => {
        const orig = Counter.findOneAndUpdate;
        Counter.findOneAndUpdate = async () => ({ seq: 42 });   // không truy cập CSDL
        try {
            const doc = new Model({ name: 'thử' });
            const own = Model.schema.s.hooks._pres.get('save').find(h => /Counter/.test(String(h.fn)));
            await own.fn.call(doc);
            assert.equal(doc.id, 42);
        } finally {
            Counter.findOneAndUpdate = orig;
        }
    });
}
