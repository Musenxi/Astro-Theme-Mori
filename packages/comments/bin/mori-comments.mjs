#!/usr/bin/env node
/**
 * VPS 上运行评论服务（Node + SQLite）。配置用环境变量：
 *   PORT=8787  DB_PATH=./comments.db  ADMIN_TOKEN=…  ALLOW_ORIGIN=https://你的站点
 *   TURNSTILE_SECRET=…（可选）  SALT=…（给邮箱 / IP 做哈希；换了盐，“以前通过过”的判断会重置）  AUTO_APPROVE=returning|all|none
 * 注意：源码是 TypeScript，靠 Node 的类型剥离直接运行（Node ≥ 22.18）；发布到 npm 时会先编译。
 */
import { startNode } from '../src/node.ts';

const env = process.env;
if (!env.ADMIN_TOKEN) console.warn('提示：没有设置 ADMIN_TOKEN，管理接口（审核、隐藏、删除）是关闭的。');
const { server } = await startNode({
  dbPath: env.DB_PATH ?? './comments.db', port: Number(env.PORT ?? 8787),
  adminToken: env.ADMIN_TOKEN, turnstileSecret: env.TURNSTILE_SECRET, allowOrigin: env.ALLOW_ORIGIN, salt: env.SALT,
  autoApprove: env.AUTO_APPROVE,
});
console.log(`MORI 评论服务已启动：端口 ${env.PORT ?? 8787}，数据库 ${env.DB_PATH ?? './comments.db'}`);
process.on('SIGINT', () => { server.close(); process.exit(0); });
