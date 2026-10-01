import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishCommand } from '../src/server.mjs';

test('没有 publish 设置时给出提示', () => assert.match(publishCommand(undefined).error, /publish/));

test('rsync：参数是数组，不经过 shell', () => {
  const c = publishCommand({ target: 'rsync', dest: 'me@host:/var/www/a b/' });
  assert.equal(c.cmd, 'rsync');
  assert.deepEqual(c.args.slice(-2), ['dist/', 'me@host:/var/www/a b/']);
  assert.ok(c.args.includes('--delete'));
});

test('cloudflare-pages：项目名必填，可带分支', () => {
  assert.match(publishCommand({ target: 'cloudflare-pages' }).error, /project/);
  const c = publishCommand({ target: 'cloudflare-pages', project: 'my-site', branch: 'main' });
  assert.deepEqual(c.args, ['--yes', 'wrangler', 'pages', 'deploy', 'dist', '--project-name', 'my-site', '--branch', 'main']);
});

test('不认识的目标', () => assert.match(publishCommand({ target: 'ftp' }).error, /ftp/));
