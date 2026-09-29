export const wan = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, '')}万` : n.toLocaleString('zh-CN'));
export const shortDate = (d: string) => d.slice(0, 10);
