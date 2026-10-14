declare module 'virtual:mori/config' {
  const config: import('./config.ts').MoriConfig;
  export default config;
}

declare module 'virtual:mori/emoji' {
  const emoji: { packs: Array<{ id: string; title: string; items: Array<{ name: string; key: string; url: string }> }>; map: Record<string, string> };
  export default emoji;
}
