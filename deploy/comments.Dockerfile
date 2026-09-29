# 评论服务（Node + SQLite）。源码是 TypeScript，靠 Node 的类型剥离直接运行，所以要 Node ≥ 22.18。
FROM node:24-alpine
WORKDIR /app
COPY packages/comments/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund hono @hono/node-server
COPY packages/comments/src ./src
COPY packages/comments/bin ./bin
COPY packages/comments/schema.sql ./schema.sql
ENV NODE_NO_WARNINGS=1
EXPOSE 8787
CMD ["node", "bin/mori-comments.mjs"]
