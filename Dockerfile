FROM node:22-slim

WORKDIR /app

# 시스템 패키지 (pandoc, mkdocs는 선택)
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# 루트 + 워크스페이스 package.json 복사
COPY package.json ./
COPY server/package.json ./server/
COPY shared/package.json* ./shared/

# 서버 의존성 설치
RUN npm install --workspace=server --workspace=shared --omit=dev

# 소스 코드 복사
COPY server/ ./server/
COPY shared/ ./shared/
COPY templates/ ./templates/
COPY model_config.json ./

# 데이터 디렉토리
RUN mkdir -p projects

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server/index.js"]
