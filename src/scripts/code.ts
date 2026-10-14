/** 代码块的复制按钮（CodeBlock.astro）：复制改完以后的代码，标成删除的行不要；成功后对勾显示一会儿 */
import { t } from './i18n.ts';

document.addEventListener('click', async (e) => {
  const btn = (e.target as Element).closest?.<HTMLButtonElement>('.code-copy');
  if (!btn) return;
  const code = btn.parentElement!.querySelector('code')!;
  const text = [...code.querySelectorAll('.line')].filter((l) => !l.classList.contains('remove')).map((l) => l.textContent).join('\n');
  try { await navigator.clipboard.writeText(text); } catch { return; }
  btn.classList.add('done');
  btn.setAttribute('aria-label', t('js.code.copied'));
  clearTimeout(Number(btn.dataset.timer));
  btn.dataset.timer = String(setTimeout(() => { btn.classList.remove('done'); btn.setAttribute('aria-label', t('js.code.copy')); }, 1600));
});
