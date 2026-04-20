# starlight-cache

Docker 이미지 빌드 시점에 Astro Starlight 공통 `node_modules`를 미리 설치해 두기 위한 디렉토리.

- `package.json`의 `dependencies`는 `server/services/starlightGenerator.js`의 `buildPackageJson()`과 **반드시 동일한 버전**이어야 한다.
- Dockerfile의 최종 이미지에 `node_modules/`가 포함된다.
- 런타임에서는 `server/services/deployment.js`의 `_buildStarlight`가 이 디렉토리의 `node_modules`를 프로젝트별 `.starlight-build/node_modules`에 심볼릭 링크로 연결하여 `npm install`을 건너뛴다.

## 의존성 업데이트 절차

1. `starlightGenerator.js`의 `buildPackageJson` 버전 변경
2. 이 디렉토리 `package.json`의 같은 의존성 버전을 동일하게 맞춤
3. `fly deploy`로 새 이미지 빌드 (이미지 빌드 단계에서 `npm install` 1회 수행)
4. 배포 후 Step 5 빌드 정상 동작 확인
