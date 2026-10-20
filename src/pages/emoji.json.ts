import type { APIRoute } from 'astro';
import emoji from 'virtual:mori/emoji';

/** 表情清单：{ "包名_表情名": 图片地址 }。评论服务发邮件时按它把 :[包名_表情名] 换成图片 */
export const GET: APIRoute = () =>
  new Response(JSON.stringify(emoji.map), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
