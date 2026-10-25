// Khuyến nghị vận hành: giữ các trường cũ, thêm trường regulation theo QĐ 1865. Chạy: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import lakeCalcService from '../src/services/lakeCalc.service.js';
import { LAKE_SPECS, ZV_CURVES } from '../src/script/lakeSpecsData.js';

test('operationRecommendation Sông Tranh 2 có regulation theo QĐ 1865', async () => {
    const svc = Object.create(lakeCalcService);
    svc.getSpec = async () => LAKE_SPECS.find(s => s.lake_id === 4);
    svc.getZVCurve = async () => ZV_CURVES.find(c => c.lake_id === 4);
    svc._controlStations = async () => null;   // không truy cập CSDL trong kiểm thử
    const r = await svc.operationRecommendation(4, 170, 1200, 800, null);
    for (const k of ['level', 'q_rec', 'reason', 'detail', 'actions', 'htl', 'q_in', 'q_out', 'fill_pct']) assert.ok(k in r, k);
    assert.equal(r.regulation.applicable, true);
    assert.ok(['flood', 'dry'].includes(r.regulation.season));
    assert.match(r.regulation.decision, /1865/);
});

test('hồ chưa có bảng Z-V vẫn được khuyến nghị theo mực nước (không ném lỗi)', async () => {
    const svc = Object.create(lakeCalcService);
    svc.getSpec = async () => LAKE_SPECS.find(s => s.lake_id === 12);           // Sông Tranh 3: MNDBT 71,5, MNGC 75,9
    svc.getZVCurve = async () => { throw new Error('Không tìm thấy bảng Z-V hồ lake_id=12'); };
    svc._controlStations = async () => null;
    const normal = await svc.operationRecommendation(12, 71.0, 300, 300, null);
    assert.equal(normal.level, 'ok');
    assert.equal(normal.fill_pct, null);
    assert.doesNotMatch(normal.detail, /NaN|null/);
    assert.equal((await svc.operationRecommendation(12, 72.0, 900, 800, null)).level, 'warning');
    assert.equal((await svc.operationRecommendation(12, 76.0, 900, 800, null)).level, 'danger');
});
