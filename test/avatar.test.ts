import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avatarTemplate, avatarUrl, AVATAR_SERVICES } from '../src/lib/avatar.mjs';

test('头像服务：默认 Cravatar；gravatar / none / 自定义地址', () => {
  assert.equal(avatarTemplate(undefined), AVATAR_SERVICES.cravatar);
  assert.equal(avatarTemplate('cravatar'), AVATAR_SERVICES.cravatar);
  assert.equal(avatarTemplate('gravatar'), AVATAR_SERVICES.gravatar);
  assert.equal(avatarTemplate('none'), '');
  assert.equal(avatarTemplate('https://a.example.com/{hash}.png'), 'https://a.example.com/{hash}.png');
});

test('头像服务：写错了（不是网址、缺 {hash}、危险协议）就退回默认，不会拼出怪地址', () => {
  for (const bad of ['gravtar', 'https://a.example.com/', 'javascript:{hash}', 42]) assert.equal(avatarTemplate(bad as never), AVATAR_SERVICES.cravatar, String(bad));
});

test('头像地址：换上哈希；没有哈希（老评论）或关掉头像就没有地址', () => {
  const t = avatarTemplate('gravatar');
  assert.equal(avatarUrl(t, 'abc123'), 'https://www.gravatar.com/avatar/abc123?s=96&d=identicon');
  assert.equal(avatarUrl(t, null), '');
  assert.equal(avatarUrl('', 'abc123'), '');
  assert.equal(avatarUrl(t, 'a/b?c'), 'https://www.gravatar.com/avatar/a%2Fb%3Fc?s=96&d=identicon'); // 哈希里的特殊字符不会跑出路径
});
