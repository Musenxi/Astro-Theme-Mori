/** 和本地服务的接口。所有请求都是同源的，服务只监听 127.0.0.1 */
const j = async (res) => {
  const body = await res.json().catch(() => ({}));
  if (!res.ok && !body.errors) throw new Error(body.error ?? `请求失败（${res.status}）`);
  return body;
};
const send = (method, url, data) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) }).then(j);

export const api = {
  project: () => fetch('/api/project').then(j),
  entry: (kind, id) => fetch(`/api/entry/${kind}/${id}`).then(j),
  save: (kind, id, data) => send('PUT', `/api/entry/${kind}/${id}`, data),
  create: (kind, body) => send('POST', `/api/entry/${kind}`, body),
  remove: (kind, id) => send('DELETE', `/api/entry/${kind}/${id}`),
  upload: (file) => fetch(`/api/asset/${encodeURIComponent(file.name)}`, { method: 'PUT', body: file }).then(j),
  previewStart: () => send('POST', '/api/preview/start', {}),
  previewStop: () => send('POST', '/api/preview/stop', {}),
  /** 构建：一路把输出交给 onChunk，结束时返回退出码 */
  async build(onChunk) {
    const res = await fetch('/api/build', { method: 'POST' });
    const reader = res.body.getReader(), dec = new TextDecoder();
    let all = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      all += dec.decode(value);
      onChunk(all);
    }
    return +(all.match(/\[exit (\d+)\]/)?.[1] ?? 1);
  },
};
