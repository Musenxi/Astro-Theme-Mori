/**
 * 发布目标里需要多步操作的两种：
 *  - git：把内容提交并推送到远端仓库（GitHub / GitLab），之后由 Actions 或 Pages 接着构建上线；
 *  - local：把构建结果镜像到本机的一个目录（调试发布流程，或配合本机的 nginx / Caddy）。
 * 只用 Node 自带的 API 和系统里的 git：git 用数组传参，不经过 shell；镜像目录用 fs，Windows 上也能用。
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, realpathSync, readdirSync, rmSync, cpSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { join, resolve, sep, isAbsolute } from 'node:path';
import { homedir } from 'node:os';

const exec = promisify(execFile);
/**
 * git 只提交这些路径：内容、图片、站点配置，以及让 Actions / Pages 能构建站点的项目文件。
 * 不会碰 .mori-studio.json（里面有管理令牌）、.mori-trash/、dist/ 或 node_modules/。
 */
export const CONTENT_PATHS = [
  'src', 'public', 'mori.config.ts', 'mori.config.mjs', 'mori.config.js',
  'package.json', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'pnpm-workspace.yaml',
  'astro.config.mjs', 'astro.config.ts', 'tsconfig.json', '.gitignore', '.github', 'wrangler.toml', 'wrangler.jsonc',
];
export const MARKER = '.mori-published';

const git = (root, args) => exec('git', args, {
  cwd: root, maxBuffer: 16 * 1024 * 1024,
  // 不弹交互提示：没登录就直接失败并说明，不要卡住
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes' },
});
const paths = (root) => CONTENT_PATHS.filter((p) => existsSync(join(root, p)));
const msgOf = (e) => String(e.stderr || e.stdout || e.message).trim();

/** 项目的 git 状态。isRepo 为 false 时其余字段没有意义 */
export async function gitInfo(root) {
  let top;
  try { top = realpathSync((await git(root, ['rev-parse', '--show-toplevel'])).stdout.trim()); } catch { return { isRepo: false }; }
  const out = async (...a) => { try { return (await git(root, a)).stdout.trim(); } catch { return ''; } };
  const remotes = [...new Map((await out('remote', '-v')).split('\n').filter((l) => l.endsWith('(push)')).map((l) => { const [name, url] = l.split(/\s+/); return [name, { name, url }]; })).values()];
  return {
    isRepo: true, top, nested: top !== realpathSync(root), // 用真实路径比：macOS 的 /var 是 /private/var 的链接
    branch: (await out('symbolic-ref', '--short', 'HEAD')) || 'main', remotes,
    changed: (await out('status', '--porcelain', '-uall', '--', ...paths(root))).split('\n').filter(Boolean).length,
    last: await out('log', '-1', '--format=%s'),
  };
}

export const GIT_URL = /^(https:\/\/|http:\/\/|ssh:\/\/|git@)[^\s]+$/;

/** 初始化仓库（还不是的话）并连上远端；已有 origin 就改地址。项目在更大的仓库里时不动它 */
export async function gitInit(root, { url, branch = 'main' }) {
  if (!GIT_URL.test(url ?? '')) throw new Error('仓库地址要写成 https://github.com/你/仓库.git 或 git@github.com:你/仓库.git');
  if (!/^[\w./-]+$/.test(branch) || branch.startsWith('-')) throw new Error('分支名里有不合法的字符');
  const info = await gitInfo(root);
  if (info.isRepo && info.nested) throw new Error(`这个项目位于另一个 git 仓库（${info.top}）里，请在那个仓库里管理它的远端`);
  try {
    if (!info.isRepo) await git(root, ['init', '-b', branch]);
    const has = (info.isRepo ? info.remotes : []).some((r) => r.name === 'origin');
    await git(root, has ? ['remote', 'set-url', 'origin', url] : ['remote', 'add', 'origin', url]);
  } catch (e) { throw new Error(msgOf(e)); }
  // 令牌、构建产物、回收站不进仓库
  const ig = join(root, '.gitignore'), have = existsSync(ig) ? readFileSync(ig, 'utf8').split('\n') : [];
  const need = ['node_modules/', 'dist/', '.astro/', '.mori-studio.json', '.mori-trash/'].filter((l) => !have.includes(l));
  if (need.length) appendFileSync(ig, `${have.length && have.at(-1) !== '' ? '\n' : ''}${need.join('\n')}\n`);
  return gitInfo(root);
}

/** 提交内容并推送。log 是一路把输出推给界面的函数；成功返回 0 */
export async function publishGit(root, p, log) {
  const info = await gitInfo(root);
  if (!info.isRepo) { log('项目还不是 git 仓库。在“发布到哪里”里填仓库地址，点“初始化并连接”。\n'); return 1; }
  const remote = p.remote || 'origin', branch = p.branch || info.branch;
  if (!info.remotes.some((r) => r.name === remote)) { log(`没有叫 ${remote} 的远端。先填仓库地址并连接。\n`); return 1; }
  const stamp = new Date().toLocaleString('sv-SE').slice(0, 16);
  const ps = paths(root);
  try {
    log('▸ 提交\n');
    await git(root, ['add', '-A', '--', ...ps]);
    const lines = (r) => r.stdout.split('\n').filter(Boolean);
    const staged = lines(await git(root, ['diff', '--cached', '--name-only', '--', ...ps]));
    const extra = lines(await git(root, ['diff', '--cached', '--name-only'])).filter((f) => !staged.includes(f));
    if (extra.length) {
      // 暂存区里有内容路径之外的东西（你在终端里 git add 过的）：Studio 不替你决定要不要一起提交
      log(`暂存区里还有 ${extra.length} 个不属于内容的文件（${extra.slice(0, 3).join('、')}${extra.length > 3 ? ' 等' : ''}）。为避免误提交，请先在终端里提交或 git restore --staged 它们，再发布。\n`);
      return 1;
    }
    if (staged.length) {
      log(`${staged.length} 个文件有改动\n`);
      log((await git(root, ['commit', '-m', p.message || `更新内容 ${stamp}`])).stdout);
    } else log('没有新的改动要提交（如果之前有提交还没推送，会一并推送）\n');
    log(`\n▸ 推送到 ${remote}/${branch}\n`);
    const r = await git(root, ['push', remote, `HEAD:${branch}`]);
    log((r.stdout + r.stderr).trim() + '\n');
    return 0;
  } catch (e) {
    const m = msgOf(e);
    log(`${m}\n`);
    if (/non-fast-forward|rejected|fetch first/.test(m)) log('\n远端有你本地没有的提交。先在终端里 git pull（或 git pull --rebase）合并，再回来发布。\n');
    else if (/Authentication|Permission denied|could not read|403|401/.test(m)) log('\n没有推送权限。Studio 用你本机 git 已有的登录（SSH 密钥、凭据管理器或 gh auth login），不保存任何密码；请先在终端里能 git push 成功。\n');
    else if (/user\.(name|email)|Please tell me who you are/.test(m)) log('\ngit 还不知道你是谁：git config --global user.name "你的名字"，git config --global user.email "你的邮箱"\n');
    return 1;
  }
}

/* ───────────── 本地目录 ───────────── */

const expand = (d) => (d === '~' ? homedir() : d.startsWith('~/') ? join(homedir(), d.slice(2)) : d);

/** 本地目录必须是绝对路径，且不能是项目本身、项目的上层目录、家目录或根目录（下面会清空它再复制） */
export function localDest(root, dest) {
  const to = resolve(expand(String(dest ?? '').trim()));
  if (!isAbsolute(expand(String(dest ?? '').trim()))) throw new Error('本地目录要写绝对路径，如 /Users/你/Sites/blog 或 ~/Sites/blog');
  // 用真实路径比较（符号链接指回项目也要拦住）；目录还不存在时，取最近的已有上层目录的真实路径
  const real = (x) => { const rest = []; let d = x; while (!existsSync(d) && d !== resolve(d, '..')) { rest.unshift(d.slice(resolve(d, '..').length + (resolve(d, '..') === sep ? 0 : 1))); d = resolve(d, '..'); } return join(realpathSync(d), ...rest); };
  const r = real(resolve(root)), rt = real(to), inside = (a, b) => a === b || a.startsWith(b.endsWith(sep) ? b : b + sep);
  if (rt === sep || rt === real(resolve(homedir())) || inside(r, rt) || inside(rt, r)) throw new Error('这个目录不能用：它是项目本身、项目的上层目录、家目录或根目录');
  return to;
}

/** 把 dist/ 镜像到目标目录。目录已有内容又不是之前发布过的（没有标记文件）就拒绝，免得清掉别的东西 */
export function publishLocal(root, dest, log) {
  const from = join(root, 'dist');
  if (!existsSync(from)) { log('没有 dist/：先构建。\n'); return 1; }
  let to;
  try { to = localDest(root, dest); } catch (e) { log(`${e.message}\n`); return 1; }
  if (existsSync(to) && readdirSync(to).length && !existsSync(join(to, MARKER))) {
    log(`${to} 不是空目录，也不是之前发布过的目录，为避免清掉别的文件，不覆盖。换一个空目录，或先清空它。\n`);
    return 1;
  }
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(to)) rmSync(join(to, f), { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  writeFileSync(join(to, MARKER), `由 MORI Studio 发布于 ${new Date().toISOString()}\n`);
  log(`已复制到 ${to}\n`);
  return 0;
}
