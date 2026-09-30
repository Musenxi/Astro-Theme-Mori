/**
 * 头像服务：评论服务给每条评论一个头像哈希（Gravatar 那种，小写邮箱的 MD5），
 * 这里把站点配置 `comments.avatar` 变成图片地址的模板（{hash} 会被换成哈希）。
 *   cravatar（默认）  Cravatar：Gravatar 的国内镜像，国内能打开，账号和头像与 Gravatar 通用
 *   gravatar          Gravatar 官方
 *   none              不显示头像
 *   含 {hash} 的地址   自己的头像服务，如 https://avatars.example.com/{hash}
 * 没有头像的人（没留邮箱、或邮箱没设过头像）显示服务给的 identicon 几何图案，每个人固定一个。
 * Studio 和站点前端共用这一份。
 */
export const AVATAR_SERVICES = {
  cravatar: 'https://cravatar.cn/avatar/{hash}?s=96&d=identicon',
  gravatar: 'https://www.gravatar.com/avatar/{hash}?s=96&d=identicon',
};

/** 站点配置 → 图片地址模板；不显示头像返回 '' */
export function avatarTemplate(setting) {
  if (setting === 'none' || setting === false) return '';
  if (setting == null || setting === '') return AVATAR_SERVICES.cravatar;
  if (typeof setting === 'string' && AVATAR_SERVICES[setting]) return AVATAR_SERVICES[setting];
  return typeof setting === 'string' && /^https?:\/\/.*\{hash\}/.test(setting) ? setting : AVATAR_SERVICES.cravatar;
}

/** 一条评论的头像地址；没有哈希或不显示头像返回 '' */
export const avatarUrl = (template, hash) => (template && hash ? template.replace('{hash}', encodeURIComponent(hash)) : '');
