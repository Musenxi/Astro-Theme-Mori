import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkPublish } from '../src/project.mjs';
import { gitInfo, gitInit, publishGit, publishLocal, localDest, MARKER } from '../src/publish.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'mori-'));
const sh = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' });

test('发布设置：git 与 local 的校验', () => {
  assert.deepEqual(checkPublish({ target: 'git' }), { target: 'git' });
  assert.deepEqual(checkPublish({ target: 'git', remote: 'origin', branch: 'main', message: ' 更新 ' }), { target: 'git', branch: 'main', message: '更新' });
  assert.throws(() => checkPublish({ target: 'git', branch: '-x' }), /分支/);
  assert.throws(() => checkPublish({ target: 'git', remote: 'a b' }), /远端/);
  assert.deepEqual(checkPublish({ target: 'local', dest: '~/Sites/blog' }), { target: 'local', dest: '~/Sites/blog' });
  assert.throws(() => checkPublish({ target: 'local', dest: 'relative/dir' }), /绝对路径/);
});

test('本地目录：拒绝项目本身、上层目录、根目录；空目录可发布；陌生的非空目录拒绝；发布过的可覆盖', () => {
  const root = tmp(); mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist/index.html'), 'v1');
  assert.throws(() => localDest(root, root), /不能用/);
  assert.throws(() => localDest(root, join(root, '..')), /不能用/);
  assert.throws(() => localDest(root, '/'), /不能用/);
  const out = []; const log = (t) => out.push(t);
  const dest = join(tmp(), 'site');
  assert.equal(publishLocal(root, dest, log), 0);
  assert.equal(readFileSync(join(dest, 'index.html'), 'utf8'), 'v1');
  assert.ok(existsSync(join(dest, MARKER)));
  writeFileSync(join(root, 'dist/index.html'), 'v2'); writeFileSync(join(dest, 'stale.txt'), 'x');
  assert.equal(publishLocal(root, dest, log), 0);
  assert.equal(readFileSync(join(dest, 'index.html'), 'utf8'), 'v2');
  assert.ok(!existsSync(join(dest, 'stale.txt')));
  const stranger = tmp(); writeFileSync(join(stranger, 'mine.txt'), 'keep');
  assert.equal(publishLocal(root, stranger, log), 1);
  assert.ok(existsSync(join(stranger, 'mine.txt')));
});

test('git：初始化、提交、推送；只提交内容路径；没有改动时不再提交', async () => {
  const remote = tmp(); sh(remote, 'init', '--bare', '-b', 'main');
  const root = tmp();
  mkdirSync(join(root, 'src/content/posts'), { recursive: true });
  writeFileSync(join(root, 'src/content/posts/a.json'), '{}');
  writeFileSync(join(root, '.mori-studio.json'), '{"adminToken":"secret"}');
  writeFileSync(join(root, 'mori.config.ts'), 'export default {}');
  assert.equal((await gitInfo(root)).isRepo, false);
  await assert.rejects(gitInit(root, { url: '--upload-pack=evil' }), /仓库地址/);
  const info = await gitInit(root, { url: remote, branch: 'main' }).catch((e) => e);
  // 本地路径不是 https/ssh 地址，按规则应被拒绝——改用 git init 后手工加远端，测推送本身
  assert.match(String(info.message), /仓库地址/);
  sh(root, 'init', '-b', 'main'); sh(root, 'remote', 'add', 'origin', remote);
  sh(root, 'config', 'user.name', 't'); sh(root, 'config', 'user.email', 't@t');
  const out = []; const log = (t) => out.push(t);
  assert.equal(await publishGit(root, {}, log), 0);
  assert.match(sh(remote, 'log', '--format=%s', 'main'), /更新内容/);
  assert.ok(!sh(remote, 'ls-tree', '-r', '--name-only', 'main').includes('.mori-studio.json'));
  assert.ok(sh(remote, 'ls-tree', '-r', '--name-only', 'main').includes('src/content/posts/a.json'));
  out.length = 0;
  assert.equal(await publishGit(root, {}, log), 0);
  assert.match(out.join(''), /没有新的改动/);
  writeFileSync(join(root, 'src/content/posts/a.json'), '{"x":1}');
  assert.equal(await publishGit(root, { message: '改了一篇' }, log), 0);
  assert.match(sh(remote, 'log', '-1', '--format=%s', 'main'), /改了一篇/);
});

test('git：远端有新提交时推送被拒，给出说明', async () => {
  const remote = tmp(); sh(remote, 'init', '--bare', '-b', 'main');
  const a = tmp(), b = tmp();
  for (const d of [a, b]) { mkdirSync(join(d, 'src'), { recursive: true }); sh(d, 'init', '-b', 'main'); sh(d, 'remote', 'add', 'origin', remote); sh(d, 'config', 'user.name', 't'); sh(d, 'config', 'user.email', 't@t'); }
  writeFileSync(join(a, 'src/x.txt'), 'a'); writeFileSync(join(b, 'src/y.txt'), 'b');
  const out = []; const log = (t) => out.push(t);
  assert.equal(await publishGit(a, {}, log), 0);
  out.length = 0;
  assert.equal(await publishGit(b, {}, log), 1);
  assert.match(out.join(''), /git pull/);
});

test('git：初始化并连接远端，忽略文件补全；已有远端就改地址', async () => {
  const root = tmp();
  const info = await gitInit(root, { url: 'https://github.com/me/blog.git', branch: 'main' });
  assert.equal(info.isRepo, true);
  assert.deepEqual(info.remotes, [{ name: 'origin', url: 'https://github.com/me/blog.git' }]);
  const ig = readFileSync(join(root, '.gitignore'), 'utf8');
  for (const l of ['node_modules/', 'dist/', '.mori-studio.json', '.mori-trash/']) assert.ok(ig.includes(l), l);
  const again = await gitInit(root, { url: 'git@github.com:me/other.git' });
  assert.equal(again.remotes[0].url, 'git@github.com:me/other.git');
  assert.equal(readFileSync(join(root, '.gitignore'), 'utf8'), ig); // 不重复追加
});

test('git：public/ 存在但没有可提交的文件时也能发布；暂存区里有内容之外的文件时拒绝', async () => {
  const remote = tmp(); sh(remote, 'init', '--bare', '-b', 'main');
  const root = tmp();
  mkdirSync(join(root, 'src'), { recursive: true }); mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(join(root, 'src/a.txt'), 'a');
  sh(root, 'init', '-b', 'main'); sh(root, 'remote', 'add', 'origin', remote); sh(root, 'config', 'user.name', 't'); sh(root, 'config', 'user.email', 't@t');
  const out = []; const log = (t) => out.push(t);
  assert.equal(await publishGit(root, {}, log), 0);
  writeFileSync(join(root, 'notes.txt'), 'x'); sh(root, 'add', 'notes.txt');
  writeFileSync(join(root, 'src/a.txt'), 'b');
  out.length = 0;
  assert.equal(await publishGit(root, {}, log), 1);
  assert.match(out.join(''), /notes\.txt/);
  assert.ok(!sh(remote, 'ls-tree', '-r', '--name-only', 'main').includes('notes.txt'));
});

test('git：项目文件（package.json、astro.config）也会提交，让 Actions / Pages 能构建；令牌、dist 不提交', async () => {
  const remote = tmp(); sh(remote, 'init', '--bare', '-b', 'main');
  const root = tmp();
  mkdirSync(join(root, 'src'), { recursive: true }); mkdirSync(join(root, 'dist'), { recursive: true });
  for (const f of ['src/a.txt', 'package.json', 'astro.config.mjs', '.mori-studio.json', 'dist/index.html']) writeFileSync(join(root, f), 'x');
  sh(root, 'init', '-b', 'main'); sh(root, 'remote', 'add', 'origin', remote); sh(root, 'config', 'user.name', 't'); sh(root, 'config', 'user.email', 't@t');
  assert.equal(await publishGit(root, {}, () => {}), 0);
  const files = sh(remote, 'ls-tree', '-r', '--name-only', 'main').split('\n');
  for (const f of ['src/a.txt', 'package.json', 'astro.config.mjs']) assert.ok(files.includes(f), f);
  for (const f of ['.mori-studio.json', 'dist/index.html']) assert.ok(!files.includes(f), f);
});
