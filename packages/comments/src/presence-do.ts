/**
 * 在线访客（Cloudflare Workers 版）：Workers 本身不保存状态，连接都交给同一个 Durable Object 管。
 * 用的是可休眠的 WebSocket：没有人数变化时它不占运行时间；读者标识放在每个连接的附件里，休眠醒来也还在。
 * 规则和 Node 版（presence.ts）一样。绑定见 wrangler.example.toml 的 ONLINE。
 */
declare const WebSocketPair: { new (): { 0: any; 1: any } };
declare const WebSocketRequestResponsePair: { new (req: string, res: string): unknown };

export class OnlinePresence {
  private state: any;
  /** 上次推出去的人数；休眠醒来后是 -1，第一次变化时总会推一次 */
  private last = -1;

  constructor(state: any) {
    this.state = state;
    // 页面每 45 秒发一个 ping 保持连接，这里自动回 pong，不用把对象叫醒
    state.setWebSocketAutoResponse?.(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(req: Request) {
    const url = new URL(req.url);
    if (url.pathname === '/count') return Response.json({ online: this.count() });
    if (url.pathname === '/views') { // 记了一次阅读：推给只看的连接
      const msg = JSON.stringify({ views: Number(await req.text()) });
      for (const ws of this.state.getWebSockets()) if (!ws.deserializeAttachment()?.visitor) try { ws.send(msg); } catch { /* 已断开 */ }
      return new Response(null, { status: 204 });
    }
    if (req.headers.get('upgrade') !== 'websocket') return new Response('需要 WebSocket', { status: 426 });
    const pair = new WebSocketPair();
    const visitor = url.searchParams.get('visitor') || null;
    this.state.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ visitor });
    if (!this.changed()) pair[1].send(JSON.stringify({ online: this.count() }));
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
  }

  webSocketClose(ws: any) { this.changed(ws); }
  webSocketError(ws: any) { this.changed(ws); }

  /** gone：正在关闭、但还在列表里的那个连接 */
  private count(gone?: any) {
    const seen = new Set<string>();
    for (const ws of this.state.getWebSockets()) {
      if (ws === gone) continue;
      const v = ws.deserializeAttachment()?.visitor;
      if (v) seen.add(v);
    }
    return seen.size;
  }

  private changed(gone?: any) {
    const n = this.count(gone);
    if (n === this.last) return false;
    this.last = n;
    const msg = JSON.stringify({ online: n });
    for (const ws of this.state.getWebSockets()) if (ws !== gone) try { ws.send(msg); } catch { /* 已断开 */ }
    return true;
  }
}
