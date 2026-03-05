FROM node:22-slim

WORKDIR /app

# 시스템 패키지
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# 루트 + 워크스페이스 package.json 복사
COPY package.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared/package.json* ./shared/

# 전체 의존성 설치 (client 빌드를 위해 devDependencies 포함)
RUN npm install --workspace=server --workspace=shared --workspace=client

# 소스 코드 복사
COPY client/ ./client/
COPY server/ ./server/
COPY shared/ ./shared/
COPY templates/ ./templates/
COPY model_config.json ./

# 프론트엔드 빌드
RUN cd client && npx vite build

# 프로덕션 불필요 의존성 정리
RUN npm prune --omit=dev --workspace=server --workspace=shared 2>/dev/null || true

# 데이터 디렉토리
RUN mkdir -p projects

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server/index.js"]
