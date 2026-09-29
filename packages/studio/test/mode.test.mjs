import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startStudio } from '../src/server.mjs';

const site = () => {
  const root = mkdtempSync(join(tmpdir(), 'mori-'));
  writeFileSync(join(root, 'mori.config.ts'), `export default {\n  title: 'T',\n  categories: [{ id: 'a', zh: 'A', en: 'A' }],\n};\n`);
  mkdirSync(join(root, 'src/content/posts'), { recursive: true });
  return root;
};
const put = (base, path, body) => fetch(base + path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

for (const dev of [false, true]) {
  test(`${dev ? '开发' : '正常'}模式：project.dev 与“本地文件夹”发布目标`, async () => {
    const s = await startStudio({ root: site(), port: 0, dev });
    const base = `http://127.0.0.1:${s.server.address().port}`;
    try {
      assert.equal((await (await fetch(`${base}/api/project`)).json()).dev, dev);
      const r = await put(base, '/api/publish-config', { publish: { target: 'local', dest: join(tmpdir(), 'mori-site-x') } });
      assert.equal(r.status, dev ? 200 : 400);
      if (!dev) assert.match((await r.json()).error, /开发模式/);
      // 其他目标在两种模式下都能设置
      assert.equal((await put(base, '/api/publish-config', { publish: { target: 'git' } })).status, 200);
    } finally { await s.stop(); }
  });
}
