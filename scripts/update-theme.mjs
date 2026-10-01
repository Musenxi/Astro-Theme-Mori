// 从模板仓库拉主题的更新，合并到当前分支：pnpm theme:update
// 第一次运行时会加一个叫 template 的远端。冲突时按 git 的提示解决（内容和配置一般不会冲突，它们只在你自己的仓库里改）。
import { execSync } from 'node:child_process';

const TEMPLATE = 'https://github.com/Musenxi/Astro-Theme-Mori.git';
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

try {
  execSync('git remote get-url template', { stdio: 'ignore' });
} catch {
  run(`git remote add template ${TEMPLATE}`);
}

try {
  run('git fetch template');
  run('git merge template/main --allow-unrelated-histories');
} catch {
  console.error('更新没有完成：解决冲突后 git commit，或者 git merge --abort 放弃这次更新。');
  process.exit(1);
}
