/**
 * MORI 内容格式（spec §3.3）：一篇文章 = 元信息 + 块序列。
 * 每个块有创建后不变的 id（划词引用评论靠它定位）；段落内部是“文字 + 标注”的序列，不在字符串里嵌 Markdown。
 * 文章只有一种结构：读法（横滚）和地图是每篇自己的设置，地点是正文里的行内标记。
 */
import { z } from 'astro/zod';
import type { SchemaContext } from 'astro/content/config';

type ImageFn = SchemaContext['image'];

/* ───────────── 行内文字 ───────────── */

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, '只能用字母、数字、下划线和连字符');

/** 标注：跨在一段文字上。旁注 / 脚注的正文放在文章的 `notes` 里，这里只存引用 */
export const markSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('em') }),
  z.object({ type: z.literal('strong') }),
  z.object({ type: z.literal('code') }),
  /** 竖排里的数字横排（text-combine-upright） */
  z.object({ type: z.literal('tcy') }),
  z.object({ type: z.literal('link'), href: z.string() }),
  /** 地点：标记住的文字是地点名，地图上的一个点。[经度, 纬度]（GeoJSON 顺序） */
  z.object({
    type: z.literal('place'),
    lnglat: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
    en: z.string().optional(),
    /** 到达日期，只用于显示 */
    date: z.string().optional(),
    /** 地图分区：new 从这里另起一个区域，same 接着上一处（不管多远）；不写就按远近自动分 */
    region: z.enum(['new', 'same']).optional(),
    /** 从上一处怎么到这里的：路线按它画（plane 画弧线，none 不连线）；不写就是普通的线 */
    by: z.enum(['walk', 'bike', 'car', 'train', 'plane', 'boat', 'none']).optional(),
  }),
  /** 旁注：宽屏放右栏，窄屏内联 */
  z.object({ type: z.literal('note'), ref: id }),
  /** 脚注：文末统一列出 */
  z.object({ type: z.literal('fn'), ref: id }),
  /** 剧透：盖住，悬停或点一下才显示 */
  z.object({ type: z.literal('spoiler') }),
  /** 行内公式：文字是 TeX，构建时排成公式 */
  z.object({ type: z.literal('math') }),
  /** 表情：文字是 包名_表情名，渲染成图 */
  z.object({ type: z.literal('emoji') }),
]);

export const spanSchema = z.object({
  t: z.string(),
  marks: z.array(markSchema).optional(),
});

/** 一段行内文字。为了手写方便，也接受一个裸字符串（等同于只有一个 span） */
export const inlineSchema = z
  .union([z.string().transform((t) => [{ t }]), z.array(spanSchema)])
  .pipe(z.array(spanSchema));

export type Mark = z.infer<typeof markSchema>;
export type Span = z.infer<typeof spanSchema>;
export type Inline = Span[];

/* ───────────── 元信息 ───────────── */

/** 置顶：有 `pin` 就是置顶，首页放文章时排在最前，`pin.order`（0–99 的整数）决定先后 */
export const pinSchema = (image: ImageFn) =>
  z.object({
    order: z.number().int().min(0).max(99).default(0),
    /** 开篇引文，已按句读断好行；首行的「悬挂在版心外，末行自动补」 */
    quote: z.array(z.string()).min(1),
    /** 图注一行：地点 · 日期 · 路线 */
    caption: z.string(),
    /** 篇名下面的三条信息，如 [日期, 篇幅, 路线] */
    meta: z.array(z.object({ label: z.string(), value: z.string() })).max(3),
    /** 封面图；不写就用文章自己的 cover */
    image: image().optional(),
    alt: z.string().optional(),
  });

const metaBase = (image: ImageFn) => ({
  title: z.string(),
  /** 副标题，可选 */
  subtitle: z.string().optional(),
  date: z.coerce.date(),
  updated: z.coerce.date().optional(),
  /** 分类 id，对应 mori.config.ts 里的 categories */
  category: z.string(),
  /** 标签，可选；Studio 里按标签管理，主题暂不按标签筛 */
  tags: z.array(z.string()).default([]),
  /** 一句摘要：目次里每篇标题下面那行 */
  excerpt: z.string(),
  cover: image().optional(),
  coverAlt: z.string().optional(),
  draft: z.boolean().default(false),
  /** 隐藏：已发布、知道地址能打开，但不进列表、搜索、订阅和站点地图 */
  hidden: z.boolean().default(false),
  pin: pinSchema(image).optional(),
});

/* ───────────── 校验：块 id 唯一、旁注引用存在 ───────────── */

/** 递归收集一个对象里所有 `{ type: 'note' | 'fn', ref }` 标注的 ref，和所有块 / 段落 id */
function walk(value: unknown, visit: (node: Record<string, unknown>) => void) {
  if (Array.isArray(value)) for (const v of value) walk(v, visit);
  else if (value && typeof value === 'object') {
    visit(value as Record<string, unknown>);
    for (const v of Object.values(value)) walk(v, visit);
  }
}

/** 块和游记文字块里的段落都带 id（引用评论钉在它们上面），图片、自由排布项没有；id 在一篇文章里必须唯一 */
function checkIntegrity(data: { blocks: unknown; notes: Record<string, unknown> }, ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  const refs: string[] = [];
  walk(data.blocks, (node) => {
    if (typeof node.id === 'string') {
      if (seen.has(node.id)) ctx.addIssue({ code: 'custom', message: `块 id “${node.id}” 重复；id 在一篇文章里必须唯一` });
      seen.add(node.id);
    }
    if ((node.type === 'note' || node.type === 'fn') && typeof node.ref === 'string') refs.push(node.ref);
  });
  for (const ref of refs) {
    if (!(ref in data.notes)) ctx.addIssue({ code: 'custom', message: `旁注 / 脚注 “${ref}” 在 notes 里没有定义` });
  }
}

/* ───────────── 图片 ───────────── */

const picture = (image: ImageFn) => ({
  src: image(),
  alt: z.string().default(''),
  caption: z.string().optional(),
});

/* ───────────── 普通文章 ───────────── */

const noteSchema = z.object({ text: inlineSchema });

/** 代码块：lang 语言；filename 标头上的文件名；highlight 要高亮的行（"1,3-5"）。行里也可以写 // [!code ++] [!code --] [!code highlight] 标出增删和高亮 */
const codeFields = {
  lang: z.string().optional(),
  filename: z.string().optional(),
  highlight: z.string().regex(/^\d+(-\d+)?(,\d+(-\d+)?)*$/, '高亮的行写成 1,3-5').optional(),
  code: z.string(),
};

/** 提示框：note 说明 / tip 提示 / important 重要 / warning 注意 / caution 警告；text 是一段一段的文字 */
const calloutFields = {
  kind: z.enum(['note', 'tip', 'important', 'warning', 'caution']).default('note'),
  text: z.array(inlineSchema).min(1),
};
/** 公式块：TeX */
const mathFields = { tex: z.string() };
/** 网站卡片：单独一行的知名网站链接（GitHub、YouTube 等），构建时取标题、简介做成卡片；认不出的网站当普通链接 */
const embedFields = { url: z.string().url() };

/** 普通文章（和页面）正文里的块 */
export const articleBlocks = (image: ImageFn) => {
  return z.discriminatedUnion('type', [
    z.object({ id, type: z.literal('p'), text: inlineSchema }),
    z.object({ id, type: z.literal('h'), level: z.union([z.literal(2), z.literal(3)]).default(2), text: inlineSchema }),
    /** 引用；`writing: 'v'` 竖排（spec §3.1） */
    z.object({ id, type: z.literal('quote'), text: inlineSchema, cite: z.string().optional(), writing: z.enum(['h', 'v']).default('h') }),
    z.object({
      id,
      type: z.literal('image'),
      ...picture(image),
      /** wide：跨出正文栏；inline：与正文同宽 */
      layout: z.enum(['wide', 'inline']).default('wide'),
    }),
    z.object({ id, type: z.literal('list'), ordered: z.boolean().default(false), items: z.array(inlineSchema) }),
    z.object({ id, type: z.literal('code'), ...codeFields }),
    z.object({ id, type: z.literal('callout'), ...calloutFields }),
    z.object({ id, type: z.literal('math'), ...mathFields }),
    z.object({ id, type: z.literal('embed'), ...embedFields }),
  ]);
};

const unit = z.number().min(0).max(1);
/** 文字自己的对齐（排版软件那样）：start 横排靠左 / 竖排靠上，end 靠右 / 靠下，justify 两端对齐；不写是各块自己的默认 */
const alignSchema = z.enum(['start', 'center', 'end', 'justify']);
/** 一组文字在块的框里的位置：start 靠左，center 居中，end 靠右（竖排的字不写是靠右）；横排的字撑满框，没有位置可调 */
const posSchema = z.enum(['start', 'center', 'end']);

/**
 * 横滚和竖滚各存各的摆法：
 *   h：横滚读法——上下位置 y（0 顶、1 底，用比例所以不同屏幕上构图一致）、缩放 scale（图是高度，竖排文字是高度，横排文字是宽度）、
 *      gap 和前一块的间距（标准间距的倍数，0 紧贴，负数叠上去）、bleed 图片上下出血铺满整屏、
 *      x 浮起来：不占位置，从原来的位置左右挪 x 个屏高（可以压在别的块上）、bw / bh 文本框的宽和高（屏高的倍数）、fs 字号倍数、lh 行距、writing 竖排（一列文字可以竖着写）、align 对齐、pos 位置
 *   v：竖滚读法——writing（同一段文字可以在横滚里竖排、竖滚里横排）、x 文本框左边在页面的哪里（页宽的比例）、bw 宽（页宽的比例）、bh 高（屏高的倍数）、fs、lh、align、pos
 */
const axes = {
  h: z.object({ y: unit.optional(), scale: z.number().positive().optional(), gap: z.number().min(-2).max(6).optional(), bleed: z.boolean().optional(), x: z.number().min(-20).max(20).optional(), bw: z.number().positive().max(10).optional(), bh: z.number().positive().max(1).optional(), fs: z.number().min(0.5).max(4).optional(), lh: z.number().min(1).max(4).optional(), writing: z.enum(['h', 'v']).optional(), align: alignSchema.optional(), pos: posSchema.optional() }).optional(),
  v: z.object({ writing: z.enum(['h', 'v']).optional(), x: z.number().min(0).max(1).optional(), bw: z.number().positive().max(1).optional(), bh: z.number().positive().max(1).optional(), fs: z.number().min(0.5).max(4).optional(), lh: z.number().min(1).max(4).optional(), align: alignSchema.optional(), pos: posSchema.optional() }).optional(),
};

/** 文章正文里的块：文字和图片，加上长卷（横滚）版式才有的图组、自由排布、地图 */
export const postBlocks = (image: ImageFn) =>
  z.discriminatedUnion('type', [
    z.object({ id, type: z.literal('p'), text: inlineSchema, ...axes }),
    z.object({ id, type: z.literal('h'), level: z.union([z.literal(2), z.literal(3)]).default(2), text: inlineSchema, ...axes }),
    z.object({ id, type: z.literal('quote'), text: inlineSchema, cite: z.string().optional(), ...axes }),
    z.object({ id, type: z.literal('image'), ...picture(image), layout: z.enum(['wide', 'inline']).default('wide'), ...axes }),
    z.object({ id, type: z.literal('list'), ordered: z.boolean().default(false), items: z.array(inlineSchema), ...axes }),
    z.object({ id, type: z.literal('code'), ...codeFields, ...axes }),
    z.object({ id, type: z.literal('callout'), ...calloutFields, ...axes }),
    z.object({ id, type: z.literal('math'), ...mathFields, ...axes }),
    z.object({ id, type: z.literal('embed'), ...embedFields, ...axes }),
    /** 双图并列 */
    z.object({ id, type: z.literal('pair'), images: z.array(z.object(picture(image))).length(2), ...axes }),
    /** 横向图组：竖向读法里是可左右滑动的一行；每张图可以缩放、上下错开 */
    z.object({
      id, type: z.literal('strip'),
      images: z.array(z.object({ ...picture(image), scale: z.number().positive().default(1), offset: z.number().default(0) })).min(2),
      ...axes,
    }),
    z.object({ id, type: z.literal('grid'), images: z.array(z.object(picture(image))).min(2), ...axes }),
    /** 自由排布：一幅画布，图和文本框的 x / y / w 是占画布的比例 */
    z.object({
      id, type: z.literal('free'),
      /** 画布宽高比 = 宽 / 高 */
      ar: z.number().positive(),
      items: z.array(
        z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('image'), ...picture(image), x: unit, y: unit, w: z.number().positive().max(1), z: z.number().int().default(1) }),
          /** 文本框：竖排（默认，一行小字）或横排；横排的 w 是框宽占画布的比例 */
          z.object({ kind: z.literal('text'), text: inlineSchema, x: unit, y: unit, writing: z.enum(['h', 'v']).default('v'), w: z.number().positive().max(1).optional() }),
        ]),
      ),
      ...axes,
    }),
    /** 地图：region 当前读到的地点所在的区域（默认），route 全程路线，near 只看当前读到的地点附近 */
    z.object({ id, type: z.literal('map'), scope: z.enum(['region', 'route', 'near']).default('region'), ...axes }),
  ]);

export const postSchema = ({ image }: SchemaContext) =>
  z
    .object({
      /** 老文件里可能写着 article；新的不用写 */
      kind: z.literal('article').optional(),
      ...metaBase(image),
      /** 一行行的事实，长卷封面的“路线 / 日期 / 里程” */
      facts: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
      /** 地图：封面的路线图、左下角的当前位置、文末的行程表。地点在正文里标 */
      map: z.boolean().default(false),
      /** 地图开着时显示哪几处：封面路线图、左下角当前位置、文末行程表；不写就都显示（正文里的地图块不受影响） */
      mapView: z.object({ hero: z.boolean().default(true), here: z.boolean().default(true), itinerary: z.boolean().default(true) }).optional(),
      /** 路线的细节：[经度, 纬度] 点列（GPX 导入、照片 EXIF 生成的轨迹）。不写就按地点顺序连线 */
      track: z.array(z.tuple([z.number(), z.number()])).optional(),
      /** 读法（横滚）。不写就是普通的竖向文章；写了就能让读者在 竖向 / 横向 / 混合 之间选 */
      reading: z
        .object({
          /** 默认读法：v 竖向 / h 横向 / mix 混合 */
          default: z.enum(['v', 'h', 'mix']).default('v'),
          allowed: z.array(z.enum(['v', 'h', 'mix'])).min(1).default(['v', 'h', 'mix']),
          /** 横滚方向：ltr 左→右；rtl 右→左（手卷） */
          direction: z.enum(['ltr', 'rtl']).default('ltr'),
        })
        .optional(),
      /** 这一篇的评论开关，只对自建评论有效：on 开启 / readonly 禁用但显示历史评论 / off 禁用且不显示。不写就跟站点（mori.config.ts 的 comments.status） */
      comments: z.enum(['on', 'readonly', 'off']).optional(),
      notes: z.record(id, noteSchema).default({}),
      blocks: z.array(postBlocks(image)),
    })
    .superRefine(checkIntegrity);

/* ───────────── 页面（关于、留言……）与友人帐 ───────────── */

/** 页面的网址就是文件名：/about/。这些名字已经被站点自己用了，页面不能取 */
export const RESERVED_SLUGS = ['posts', 'archive', 'category', 'search', 'feed', 'rss', '404', 'sitemap', 'robots', 'favicon', '_astro', 'api', 'live', 'map'];

/** 独立页面：正文和文章用同一套块。template 为 friends 的页面，正文后面接友人帐 */
export const pageSchema = ({ image }: SchemaContext) =>
  z
    .object({
      title: z.string(),
      subtitle: z.string().optional(),
      excerpt: z.string().default(''),
      draft: z.boolean().default(false),
      hidden: z.boolean().default(false),
      template: z.enum(['default', 'friends']).default('default'),
      /** 页面底部是否开放评论 */
      comments: z.boolean().default(false),
      notes: z.record(id, noteSchema).default({}),
      blocks: z.array(articleBlocks(image)).default([]),
    })
    .superRefine(checkIntegrity);

/** 友人帐里的一位：网址必填，头像可以是图片网址，也可以是项目里的图 */
export const friendSchema = ({ image }: SchemaContext) =>
  z.object({
    name: z.string(),
    url: z.string().url(),
    desc: z.string().default(''),
    avatar: z.union([z.string().url(), image()]).optional(),
    /** 排序，小的在前；缺省按文件里的先后 */
    order: z.number().int().min(0).max(99).default(0),
  });

/** 一篇文章，放在 src/content/posts/ 下 */
export const entrySchema = (ctx: SchemaContext) => postSchema(ctx);

export type PostData = z.infer<ReturnType<typeof postSchema>>;
export type EntryData = PostData;
export type PageData = z.infer<ReturnType<typeof pageSchema>>;
export type FriendData = z.infer<ReturnType<typeof friendSchema>>;
export type PostBlock = PostData['blocks'][number];
