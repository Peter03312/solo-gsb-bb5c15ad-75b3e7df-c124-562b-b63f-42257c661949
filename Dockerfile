# 多色滚筒套准点校核应用 —— 生产镜像
FROM node:20-alpine

WORKDIR /app

# 优先拷贝依赖清单以利用 Docker 层缓存
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# 拷贝应用源码
COPY server.js ./
COPY lib ./lib
COPY public ./public

# 数据持久化目录（compose 会在此挂载卷）
RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_FILE=/app/data/schemes.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
