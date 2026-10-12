/** 实况照片的视频（还没上传到图床的）：/live/<在 src/assets 下的路径>.mp4 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { APIRoute } from 'astro';
import { localVideos } from '../../lib/live.ts';

export function getStaticPaths() {
  return localVideos().map((path) => ({ params: { path } }));
}

export const GET: APIRoute = ({ params }) => new Response(readFileSync(join(process.cwd(), 'src/assets', params.path!)), { headers: { 'Content-Type': 'video/mp4' } });
