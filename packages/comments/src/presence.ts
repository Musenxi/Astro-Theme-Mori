/**
 * 在线访客（Node 版，放在内存里）：页面连上 /online/ws 就算在线，断开就不算。
 * 同一位读者开几个页面只算一个；只看的连接（Studio 仪表盘）不算。人数一变就推给所有连接：{"online": n}；
 * 只看的连接另外收到全站阅读量的变化：{"views": n}
 * Cloudflare Workers 上同样的事由 Durable Object 做，见 presence-do.ts。
 */
export interface Peer { send(msg: string): void }

export class Presence {
  /** 连接 → 读者标识的哈希；null 是只看人数的连接 */
  private peers = new Map<Peer, string | null>();
  private last = 0;

  count() {
    const seen = new Set<string>();
    for (const v of this.peers.values()) if (v) seen.add(v);
    return seen.size;
  }

  join(peer: Peer, visitor: string | null) {
    this.peers.set(peer, visitor);
    if (!this.changed()) send(peer, this.last); // 人数没变就只告诉新来的
  }

  /** 推给只看的连接 */
  toWatchers(data: Record<string, number>) {
    const msg = JSON.stringify(data);
    for (const [p, v] of this.peers) if (v === null) try { p.send(msg); } catch { /* 已断开 */ }
  }

  leave(peer: Peer) {
    if (this.peers.delete(peer)) this.changed();
  }

  /** 人数变了就推给所有连接；返回有没有推 */
  private changed() {
    const n = this.count();
    if (n === this.last) return false;
    this.last = n;
    for (const p of this.peers.keys()) send(p, n);
    return true;
  }
}

const send = (p: Peer, n: number) => { try { p.send(JSON.stringify({ online: n })); } catch { /* 连接已经断了，等 close 事件 */ } };
