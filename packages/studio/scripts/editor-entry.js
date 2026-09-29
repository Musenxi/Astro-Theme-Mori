/**
 * Markdown 编辑器（CodeMirror 6）。这是打包的入口：`pnpm build:editor` 生成 ui/vendor/cm.js，生成物提交进仓库，
 * 所以运行 Studio 不需要构建，也不需要装 CodeMirror。
 * 弱渲染：标题变大、粗体变粗、斜体变斜，Markdown 符号变淡但不消失，文字始终是源码。
 */
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const style = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.9em', letterSpacing: '.05em', lineHeight: '1.5' },
  { tag: t.heading2, fontSize: '1.3em', letterSpacing: '.1em' },
  { tag: t.heading3, fontSize: '1.12em', letterSpacing: '.08em' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.monospace, fontFamily: 'var(--mono)', fontSize: '.9em', background: 'var(--paper-2)' },
  { tag: t.link, color: 'var(--accent)' },
  { tag: t.url, color: 'var(--ink-3)' },
  { tag: t.quote, color: 'var(--ink-2)' },
  { tag: t.processingInstruction, color: 'var(--ink-3)', fontWeight: '400', fontStyle: 'normal' },
  { tag: t.contentSeparator, color: 'var(--ink-3)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', background: 'transparent', color: 'var(--ink)', fontSize: '16px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--serif)', lineHeight: '2', overflow: 'auto' },
  '.cm-content': { caretColor: 'var(--accent)', padding: '24px 0 40vh', maxWidth: '760px', margin: '0 auto' },
  '.cm-line': { padding: '0 32px' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { background: 'color-mix(in srgb, var(--accent) 22%, transparent)' },
  '.cm-placeholder': { color: 'var(--ink-3)' },
});

/** 选中文字前后加符号；已经加过就去掉；没选中就放一对符号并把光标放中间 */
function wrap(view, before, after = before) {
  view.dispatch(view.state.changeByRange((r) => {
    const s = view.state.sliceDoc(r.from, r.to);
    const b = view.state.sliceDoc(r.from - before.length, r.from), a = view.state.sliceDoc(r.to, r.to + after.length);
    if (b === before && a === after) return { changes: [{ from: r.from - before.length, to: r.from }, { from: r.to, to: r.to + after.length }], range: EditorSelection.range(r.from - before.length, r.to - before.length) };
    return { changes: [{ from: r.from, insert: before }, { from: r.to, insert: after }], range: EditorSelection.range(r.from + before.length, r.to + before.length) };
  }));
  view.focus();
  return true;
}

/** 给选中的每一行加/去行首符号（标题、引用、列表） */
function prefixLines(view, prefix, strip = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)) {
  const changes = [], seen = new Set();
  for (const r of view.state.selection.ranges) {
    for (let p = r.from; p <= r.to; ) {
      const line = view.state.doc.lineAt(p);
      if (!seen.has(line.number)) {
        seen.add(line.number);
        const m = line.text.match(strip);
        if (m) changes.push({ from: line.from, to: line.from + m[0].length });
        else changes.push({ from: line.from, insert: prefix });
      }
      p = line.to + 1;
    }
  }
  view.dispatch({ changes });
  view.focus();
  return true;
}

export function createEditor({ parent, doc, placeholder, onChange, onImages }) {
  const insertImages = async (view, files, pos) => {
    if (!onImages) return;
    const names = await onImages(files);
    if (!names.length) return;
    const at = pos ?? view.state.selection.main.head;
    view.dispatch({ changes: { from: at, insert: names.map((n) => `\n\n![](${n})\n\n`).join('') } });
  };
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        history(),
        markdown(),
        syntaxHighlighting(style),
        theme,
        EditorView.lineWrapping,
        placeholder ? cmPlaceholder(placeholder) : [],
        keymap.of([
          { key: 'Mod-b', run: (v) => wrap(v, '**') },
          { key: 'Mod-i', run: (v) => wrap(v, '*') },
          { key: 'Mod-k', run: (v) => linkSelection(v) },
          indentWithTab, ...defaultKeymap, ...historyKeymap,
        ]),
        EditorView.updateListener.of((u) => { if (u.docChanged) onChange?.(u.state.doc.toString()); }),
        EditorView.domEventHandlers({
          paste(e, v) {
            const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
            if (!files.length) return false;
            e.preventDefault(); insertImages(v, files); return true;
          },
          drop(e, v) {
            const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
            if (!files.length) return false;
            e.preventDefault(); insertImages(v, files, v.posAtCoords({ x: e.clientX, y: e.clientY }) ?? undefined); return true;
          },
        }),
      ],
    }),
  });

  function linkSelection(v) {
    const r = v.state.selection.main, s = v.state.sliceDoc(r.from, r.to);
    v.dispatch({ changes: { from: r.from, to: r.to, insert: `[${s}]()` }, selection: { anchor: r.from + s.length + 3 } });
    v.focus();
    return true;
  }

  return {
    view,
    getText: () => view.state.doc.toString(),
    /** 外部整体替换文本（比如从磁盘重新读取） */
    setText(text) { if (text !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
    bold: () => wrap(view, '**'),
    italic: () => wrap(view, '*'),
    code: () => wrap(view, '`'),
    link: () => linkSelection(view),
    h2: () => prefixLines(view, '## ', /^#{1,4} /),
    h3: () => prefixLines(view, '### ', /^#{1,4} /),
    quote: () => prefixLines(view, '> '),
    list: () => prefixLines(view, '- '),
    /** 光标处插一段文字（图库选中的图片等），前后各空一行 */
    insertBlock(text) {
      const at = view.state.selection.main.head;
      view.dispatch({ changes: { from: at, insert: `\n\n${text}\n\n` }, selection: { anchor: at + text.length + 4 } });
      view.focus();
    },
    /** 加一条旁注：光标处放引用，文末追加定义，光标跳到定义处等着输入 */
    addNote() {
      const text = view.state.doc.toString();
      let max = 0;
      for (const m of text.matchAll(/\[\^n(\d+)\]/g)) max = Math.max(max, +m[1]);
      const id = `n${max + 1}`, at = view.state.selection.main.head, def = `\n\n[^${id}]: `;
      const end = view.state.doc.length + `[^${id}]`.length;
      view.dispatch({ changes: [{ from: at, insert: `[^${id}]` }, { from: view.state.doc.length, insert: def }], selection: { anchor: end + def.length } });
      view.focus();
      view.dispatch({ effects: EditorView.scrollIntoView(end + def.length, { y: 'center' }) });
    },
  };
}
