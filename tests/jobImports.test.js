// File trong src/jobs/ khởi động cron (và có khi chạy ngay) lúc được import → chỉ server.js được nạp chúng, qua danh
// sách CRON_JOBS (tắt bằng DISABLE_JOBS=1). Lỗi cũ: controller import floodAlert.job.js → job vẫn chạy khi
// DISABLE_JOBS=1 (máy local ghi vào CSDL thật). Chạy: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '../src');
const files = dir => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(e => (e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));

test('không file nào ngoài server.js import module trong src/jobs/', () => {
    const bad = files(SRC)
        .filter(f => path.basename(f) !== 'server.js' && !f.includes(`${path.sep}jobs${path.sep}`))
        .filter(f => /(from\s+|import\s*\(\s*)['"][^'"]*\/jobs\//.test(fs.readFileSync(f, 'utf8')))
        .map(f => path.relative(SRC, f));
    assert.deepEqual(bad, []);
});
