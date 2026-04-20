import { readFile, writeFile, readdir, stat, mkdir, unlink, copyFile, rm, cp, symlink, lstat } from 'fs/promises';
import { join, dirname, relative, resolve as resolvePath } from 'path';
import { existsSync, createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import { execa } from 'execa';
import { markdownToDocx } from './docxGenerator.js';
import { generateStarlightProject } from './starlightGenerator.js';

// 포트폴리오 저장소 (서버 관리용)
const PORTFOLIO_REPO_OWNER = 'greatsong';
const PORTFOLIO_REPO_NAME = 'eduflow-portfolio';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Astro Starlight 공통 node_modules 캐시 경로
 * - Docker 이미지 빌드 시점에 `server/services/starlight-cache/`에 설치된 공용 캐시
 * - 런타임 Step 5 빌드가 프로젝트별 .starlight-build/node_modules를 이 경로로 심볼릭 링크 연결
 * - 환경변수 STARLIGHT_NODE_MODULES_CACHE로 오버라이드 가능 (테스트/로컬용)
 */
const STARLIGHT_CACHE_DIR = resolvePath(__dirname, 'starlight-cache');
const STARLIGHT_CACHE_NODE_MODULES = process.env.STARLIGHT_NODE_MODULES_CACHE
  || join(STARLIGHT_CACHE_DIR, 'node_modules');

export class Deployment {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.docsPath = join(projectPath, 'docs');
    this.outputPath = join(projectPath, 'output');
    this.sitePath = join(projectPath, 'site');
  }

  async init() {
    if (!existsSync(this.outputPath)) {
      await mkdir(this.outputPath, { recursive: true });
    }
  }

  /**
   * pip 도구(mkdocs, pandoc) 실행 커맨드 결정
   * PATH에 없으면 python -m 으로 폴백
   */
  async _resolveCmd(name) {
    try {
      await execa(name, ['--version'], { shell: true });
      return { cmd: name, args: [] };
    } catch {
      return { cmd: 'python', args: ['-m', name] };
    }
  }

  /**
   * 생성된 챕터 파일 목록 (TOC 순서)
   */
  async getChapterFiles() {
    const tocFile = join(this.projectPath, 'toc.json');
    const ordered = [];

    if (existsSync(tocFile)) {
      try {
        const tocData = JSON.parse(await readFile(tocFile, 'utf-8'));
        for (const part of tocData.parts || []) {
          for (const ch of part.chapters || []) {
            const file = join(this.docsPath, `${ch.chapter_id}.md`);
            if (existsSync(file)) {
              ordered.push({ id: ch.chapter_id, title: ch.chapter_title, path: file });
            }
          }
        }
      } catch { /* skip */ }
    }

    // TOC에 없는 파일도 추가 (fallback)
    if (existsSync(this.docsPath)) {
      const files = await readdir(this.docsPath);
      const orderedIds = new Set(ordered.map((f) => f.id));
      for (const file of files.filter((f) => f.startsWith('chapter') && f.endsWith('.md')).sort()) {
        const id = file.replace('.md', '');
        if (!orderedIds.has(id)) {
          ordered.push({ id, title: id, path: join(this.docsPath, file) });
        }
      }
    }

    return ordered;
  }

  /**
   * CLI 도구 설치 여부 확인
   * pip 도구(mkdocs, pandoc)는 PATH에 없을 수 있어 python -m 으로도 시도
   */
  async checkTool(name) {
    try {
      await execa(name, ['--version'], { shell: true });
      return true;
    } catch {
      if (name === 'mkdocs' || name === 'pandoc') {
        try {
          await execa('python', ['-m', name, '--version'], { shell: true });
          return true;
        } catch { /* fallthrough */ }
      }
      return false;
    }
  }

  /**
   * 도구 설치 상태 전체 확인
   *
   * Starlight 빌드에 필요한 node/npm도 체크한다.
   * 기본 테마는 Starlight이므로 이 둘이 없으면 빌드 불가.
   */
  async checkTools() {
    const [mkdocs, pandoc, git, gh, node, npm] = await Promise.all([
      this.checkTool('mkdocs'),
      this.checkTool('pandoc'),
      this.checkTool('git'),
      this.checkTool('gh'),
      this.checkTool('node'),
      this.checkTool('npm'),
    ]);
    return { mkdocs, pandoc, git, gh, node, npm };
  }

  /**
   * MkDocs 프로젝트 설정 생성 (mkdocs.yml + index.md)
   */
  async generateMkdocsConfig(siteName, theme = 'material', creator = null, colorTheme = 'indigo') {
    const tocFile = join(this.projectPath, 'toc.json');
    let tocData = null;
    if (existsSync(tocFile)) {
      try { tocData = JSON.parse(await readFile(tocFile, 'utf-8')); } catch { /* skip */ }
    }

    const chapters = await this.getChapterFiles();
    if (chapters.length === 0) {
      return { success: false, message: '챕터 파일이 없습니다' };
    }

    // nav 구성
    let navYaml = '  - Home: index.md\n';

    if (tocData) {
      for (const part of tocData.parts || []) {
        const partTitle = `Part ${part.part_number} - ${part.part_title}`;
        const partChapters = (part.chapters || []).filter((ch) =>
          existsSync(join(this.docsPath, `${ch.chapter_id}.md`))
        );
        if (partChapters.length > 0) {
          navYaml += `  - "${partTitle}":\n`;
          for (const ch of partChapters) {
            navYaml += `    - "${ch.chapter_title}": ${ch.chapter_id}.md\n`;
          }
        }
      }
    }

    const desc = tocData?.description || '';

    // 커스텀 CSS 복사 + 테마 색상 변수 주입
    const stylesDir = join(this.docsPath, 'stylesheets');
    if (!existsSync(stylesDir)) await mkdir(stylesDir, { recursive: true });
    const customCssSource = join(__dirname, '..', 'assets', 'mkdocs-custom.css');
    if (existsSync(customCssSource)) {
      let cssContent = await readFile(customCssSource, 'utf-8');
      // 테마별 CSS 변수 오버라이드 (모든 테마 색상 변수 포함)
      const CSS_VARS = {
        indigo: {
          primary: '#4f46e5', dark: '#4338ca', light: '#eef2ff', lighter: '#f5f3ff',
          accent: '#7c3aed', text: '#312e81', border: '#c7d2fe',
          deep: '#1e1b4b', deepMid: '#312e81', codeBorder: '#e0e7ff',
          footerLink: '#a5b4fc', footerLinkHover: '#c7d2fe',
          darkText: '#c4b5fd',
        },
        teal: {
          primary: '#0d9488', dark: '#0f766e', light: '#f0fdfa', lighter: '#f0fdf4',
          accent: '#10b981', text: '#134e4a', border: '#99f6e4',
          deep: '#042f2e', deepMid: '#134e4a', codeBorder: '#ccfbf1',
          footerLink: '#5eead4', footerLinkHover: '#99f6e4',
          darkText: '#5eead4',
        },
        amber: {
          primary: '#ea580c', dark: '#c2410c', light: '#fff7ed', lighter: '#fffbeb',
          accent: '#f59e0b', text: '#7c2d12', border: '#fed7aa',
          deep: '#431407', deepMid: '#7c2d12', codeBorder: '#ffedd5',
          footerLink: '#fdba74', footerLinkHover: '#fed7aa',
          darkText: '#fdba74',
        },
        blue: {
          primary: '#2563eb', dark: '#1d4ed8', light: '#eff6ff', lighter: '#f0f9ff',
          accent: '#0ea5e9', text: '#1e3a5f', border: '#bfdbfe',
          deep: '#172554', deepMid: '#1e3a5f', codeBorder: '#dbeafe',
          footerLink: '#93c5fd', footerLinkHover: '#bfdbfe',
          darkText: '#93c5fd',
        },
        rose: {
          primary: '#e11d48', dark: '#be123c', light: '#fff1f2', lighter: '#fdf2f8',
          accent: '#f43f5e', text: '#881337', border: '#fecdd3',
          deep: '#4c0519', deepMid: '#881337', codeBorder: '#ffe4e6',
          footerLink: '#fda4af', footerLinkHover: '#fecdd3',
          darkText: '#fda4af',
        },
      };
      const cv = CSS_VARS[colorTheme] || CSS_VARS.indigo;
      // CSS 변수 오버라이드를 파일 끝에 추가 (나중 선언이 우선)
      const overrideVars = `
/* === Color Theme Override: ${colorTheme} === */
:root {
  --ef-primary: ${cv.primary};
  --ef-primary-dark: ${cv.dark};
  --ef-primary-light: ${cv.light};
  --ef-primary-lighter: ${cv.lighter};
  --ef-accent: ${cv.accent};
  --ef-primary-text: ${cv.text};
  --ef-primary-border: ${cv.border};
  --ef-primary-deep: ${cv.deep};
  --ef-primary-deep-mid: ${cv.deepMid};
  --ef-code-border: ${cv.codeBorder};
  --ef-footer-link: ${cv.footerLink};
  --ef-footer-link-hover: ${cv.footerLinkHover};
}
[data-md-color-scheme="slate"] {
  --ef-primary-text: ${cv.darkText};
}
`;
      cssContent = cssContent + overrideVars;
      await writeFile(join(stylesDir, 'custom.css'), cssContent, 'utf-8');
    }

    // 커스텀 JS 복사 (헤더 제목 클릭, Mermaid 설정, 스크롤 프로그레스)
    const jsDir = join(this.docsPath, 'javascripts');
    if (!existsSync(jsDir)) await mkdir(jsDir, { recursive: true });

    // 기본 JS 파일 (항상 복사)
    const jsFiles = [
      { src: 'mkdocs-title-link.js', dest: 'title-link.js' },
      { src: 'mermaid-config.js', dest: 'mermaid-config.js' },
      { src: 'scroll-progress.js', dest: 'scroll-progress.js' },
      { src: 'eduflow-nav.js', dest: 'eduflow-nav.js' },
      { src: 'lightbox.js', dest: 'lightbox.js' },
    ];

    // 조건부 JS: quiz-engine.js — assessment_level 4일 때만 포함
    let needsQuizEngine = false;
    {
      const configPath = join(this.projectPath, 'config.json');
      if (existsSync(configPath)) {
        try {
          const config = JSON.parse(await readFile(configPath, 'utf-8'));
          if (config.assessment_level >= 4) needsQuizEngine = true;
        } catch { /* ignore */ }
      }
    }
    if (needsQuizEngine) {
      jsFiles.push({ src: 'quiz-engine.js', dest: 'quiz-engine.js' });
    }

    // 조건부 JS: circuit-diagrams.js — template-info.json의 required_assets 또는 config.include_hw_diagrams 확인
    let needsCircuitDiagrams = false;
    const templateInfoPath = join(this.projectPath, 'template-info.json');
    if (existsSync(templateInfoPath)) {
      try {
        const templateInfo = JSON.parse(await readFile(templateInfoPath, 'utf-8'));
        const requiredJs = templateInfo?.required_assets?.javascript || [];
        if (requiredJs.includes('circuit-diagrams.js')) {
          needsCircuitDiagrams = true;
        }
      } catch { /* ignore */ }
    }
    if (!needsCircuitDiagrams) {
      const configPath = join(this.projectPath, 'config.json');
      if (existsSync(configPath)) {
        try {
          const config = JSON.parse(await readFile(configPath, 'utf-8'));
          if (config.include_hw_diagrams) {
            needsCircuitDiagrams = true;
          }
        } catch { /* ignore */ }
      }
    }
    if (needsCircuitDiagrams) {
      jsFiles.push({ src: 'circuit-diagrams.js', dest: 'circuit-diagrams.js' });
    }

    for (const jf of jsFiles) {
      const srcPath = join(__dirname, '..', 'assets', jf.src);
      if (existsSync(srcPath)) {
        await copyFile(srcPath, join(jsDir, jf.dest));
      }
    }

    // 제작자 정보 (copyright 푸터)
    const creatorName = creator?.name || '';
    const creatorAffiliation = creator?.affiliation || '';
    const copyrightParts = [];
    if (creatorName) copyrightParts.push(creatorName);
    if (creatorAffiliation) copyrightParts.push(creatorAffiliation);
    const year = new Date().getFullYear();
    const copyrightLine = copyrightParts.length > 0
      ? `Copyright &copy; ${year} ${copyrightParts.join(' · ')} | <a href='https://eduflow-greatsong.fly.dev/'>EduFlow</a>로 제작`
      : `Copyright &copy; ${year} | <a href='https://eduflow-greatsong.fly.dev/'>EduFlow</a>로 제작`;

    const authorLine = copyrightParts.length > 0
      ? `${copyrightParts.join(' · ')} (EduFlow)`
      : 'EduFlow';

    // 색상 테마 매핑
    const COLOR_THEMES = {
      indigo:  { primary: 'indigo', accent: 'deep purple' },
      teal:    { primary: 'teal', accent: 'green' },
      amber:   { primary: 'deep orange', accent: 'amber' },
      blue:    { primary: 'blue', accent: 'cyan' },
      rose:    { primary: 'pink', accent: 'red' },
    };
    const ct = COLOR_THEMES[colorTheme] || COLOR_THEMES.indigo;

    const config = `site_name: "${siteName}"
site_description: "${desc}"
site_author: "${authorLine}"
copyright: "${copyrightLine}"

theme:
  name: ${theme}
  language: ko
  palette:
    - media: "(prefers-color-scheme: light)"
      scheme: default
      primary: ${ct.primary}
      accent: ${ct.accent}
      toggle:
        icon: material/brightness-7
        name: "\uB2E4\uD06C \uBAA8\uB4DC\uB85C \uC804\uD658"
    - media: "(prefers-color-scheme: dark)"
      scheme: slate
      primary: ${ct.primary}
      accent: ${ct.accent}
      toggle:
        icon: material/brightness-4
        name: "\uB77C\uC774\uD2B8 \uBAA8\uB4DC\uB85C \uC804\uD658"
  font:
    text: Noto Sans KR
    code: JetBrains Mono
  features:
    - navigation.tabs
    - navigation.tabs.sticky
    - navigation.sections
    - navigation.top
    - navigation.indexes
    - navigation.instant
    - navigation.path
    - navigation.footer
    - search.suggest
    - search.highlight
    - search.share
    - content.code.copy
    - content.code.annotate
    - content.tabs.link
    - toc.follow
  icon:
    repo: fontawesome/brands/github

plugins:
  - search:
      lang:
        - ko
        - en

markdown_extensions:
  - admonition
  - codehilite
  - footnotes
  - abbr
  - toc:
      permalink: true
  - pymdownx.highlight:
      anchor_linenums: true
      line_spans: __span
      pygments_lang_class: true
  - pymdownx.inlinehilite
  - pymdownx.superfences:
      custom_fences:
        - name: mermaid
          class: mermaid
          format: !!python/name:pymdownx.superfences.fence_div_format
  - pymdownx.details
  - pymdownx.tasklist:
      custom_checkbox: true
  - pymdownx.tabbed:
      alternate_style: true
  - pymdownx.emoji:
      emoji_index: !!python/name:material.extensions.emoji.twemoji
      emoji_generator: !!python/name:material.extensions.emoji.to_svg
  - attr_list
  - md_in_html
  - def_list

extra_javascript:
  - https://unpkg.com/mermaid@10/dist/mermaid.min.js
  - javascripts/title-link.js
  - javascripts/mermaid-config.js
  - javascripts/scroll-progress.js
  - javascripts/eduflow-nav.js
  - javascripts/lightbox.js
${needsCircuitDiagrams ? '  - javascripts/circuit-diagrams.js\n' : ''}${needsQuizEngine ? '  - javascripts/quiz-engine.js\n' : ''}
extra_css:
  - stylesheets/custom.css

docs_dir: docs
site_dir: site

nav:
${navYaml}`;

    await writeFile(join(this.projectPath, 'mkdocs.yml'), config, 'utf-8');

    // index.md 생성 (항상 갱신 — 제작자 정보 반영)
    const indexPath = join(this.docsPath, 'index.md');
    {
      let indexContent = `# ${siteName}\n\n${desc}\n\n`;

      if (tocData) {
        indexContent += '## 목차\n\n';
        for (const part of tocData.parts || []) {
          indexContent += `\n### Part ${part.part_number}: ${part.part_title}\n\n`;
          for (const ch of part.chapters || []) {
            if (existsSync(join(this.docsPath, `${ch.chapter_id}.md`))) {
              indexContent += `- [${ch.chapter_title}](${ch.chapter_id}.md)\n`;
            }
          }
        }
      }

      // 발행 메타데이터 로드
      const projConfigPath = join(this.projectPath, 'config.json');
      let projConfig = {};
      if (existsSync(projConfigPath)) {
        try { projConfig = JSON.parse(await readFile(projConfigPath, 'utf-8')); } catch {}
      }
      const pub = projConfig.publishing || {};
      const publisher = pub.publisher || creatorName || '';
      const publishedDate = pub.published_date || new Date().toISOString().split('T')[0];
      const pubReviewers = pub.reviewers || [];
      const reviewerText = pubReviewers.length > 0 ? pubReviewers.join(', ') : '(미지정)';
      const repoUrl = projConfig.repo_url || '';

      // 발행 정보 (하단 — 자연스러운 소형 푸터)
      const pubParts = [];
      if (publisher) pubParts.push(publisher);
      if (creatorAffiliation) pubParts.push(creatorAffiliation);
      pubParts.push(publishedDate);
      pubParts.push(`검토: ${reviewerText}`);

      indexContent += '\n---\n\n';
      indexContent += `<div class="publish-footer" markdown>\n\n`;
      indexContent += pubParts.join(' · ') + '\n\n';
      const links = [];
      if (repoUrl) links.push(`[GitHub](${repoUrl})`);
      links.push('[EduFlow](https://eduflow-greatsong.fly.dev/)');
      indexContent += links.join(' · ') + '\n\n';
      indexContent += `</div>\n`;

      await writeFile(indexPath, indexContent, 'utf-8');
    }

    return { success: true, configPath: join(this.projectPath, 'mkdocs.yml') };
  }

  /**
   * 사이트 빌드 (테마 디스패처)
   *
   * theme 옵션:
   *  - 'starlight' (기본): Astro Starlight으로 빌드. node/npm 필요.
   *  - 'mkdocs': MkDocs Material (레거시). mkdocs CLI 필요.
   *
   * siteUrl/basePath는 Starlight의 astro.config.mjs에 주입된다 (GitHub Pages용).
   */
  async buildWebsite(opts = {}) {
    const {
      theme = 'starlight',
      siteName,
      creator,
      colorTheme,
      accentColor,
      siteUrl,
      basePath,
    } = opts;

    if (theme === 'starlight') {
      return this._buildStarlight({ siteName, creator, colorTheme, accentColor, siteUrl, basePath });
    }
    return this._buildMkdocs();
  }

  /**
   * MkDocs Material 빌드 (레거시)
   */
  async _buildMkdocs() {
    try {
      const { cmd, args } = await this._resolveCmd('mkdocs');
      const result = await execa(cmd, [...args, 'build'], {
        cwd: this.projectPath,
        timeout: 120000,
        shell: true,
      });
      return { success: true, theme: 'mkdocs', message: '빌드 성공', stdout: result.stdout };
    } catch (e) {
      return { success: false, theme: 'mkdocs', message: e.shortMessage || e.message, error: e.stderr };
    }
  }

  /**
   * Astro Starlight 빌드 (기본)
   *
   * 흐름:
   *  1) starlightGenerator로 projectPath/.starlight-build/ 소스 트리 생성
   *  2) astro.config.mjs의 __SITE__, __BASE__ placeholder 치환
   *  3) 최초 1회 npm install (node_modules 있으면 재활용)
   *  4) npx astro build → dist/
   *  5) dist/ → projectPath/site/ 로 교체
   *  6) .nojekyll 생성 (GitHub Pages의 _astro/ 폴더 차단 방지)
   *
   * siteUrl 예: 'https://greatsong.github.io'
   * basePath 예: '/my-project/'  (반드시 슬래시 포함)
   */
  async _buildStarlight({ siteName, creator, colorTheme, accentColor, siteUrl = '', basePath = '/' } = {}) {
    try {
      // 1) 소스 트리 생성
      const result = await generateStarlightProject({
        projectPath: this.projectPath,
        siteName,
        creator,
        colorTheme,
        accentColor,
        basePath, // index.md/404.md 내부 링크에 prefix로 박아 넣기 위해 전달
      });

      // 2) placeholder 치환 (astro.config.mjs의 __SITE__ / __BASE__ 모두)
      //    siteUrl이 비어 있으면 site: '' 로 치환되어 Astro 5의 URL 유효성 검증이 실패하므로
      //    site 필드 자체를 제거. site는 GitHub Pages 배포용이고 미리보기 빌드에는 불필요.
      const configPath = join(result.buildDir, 'astro.config.mjs');
      let cfg = await readFile(configPath, 'utf-8');
      if (siteUrl) {
        cfg = cfg.replaceAll('__SITE__', siteUrl);
      } else {
        cfg = cfg.replace(/^\s*site:\s*'__SITE__',?\s*\n/m, '');
      }
      cfg = cfg.replaceAll('__BASE__', basePath);
      await writeFile(configPath, cfg, 'utf-8');

      // 3) node_modules 준비 — 공용 캐시를 buildDir로 복사
      //    Dockerfile이 /app/server/services/starlight-cache/node_modules 를 미리 설치해 둔다.
      //    과거엔 symlink 시도했으나 Astro/Vite의 절대 경로 resolver가
      //    "No cached compile metadata found" 오류를 내 실패 → 복사로 전환.
      //    복사는 200MB 기준 10~30초로 npm install(60~120초)보다 여전히 2~4배 빠름.
      //    - generateStarlightProject가 매번 buildDir을 rm -rf 후 재생성하므로 여기서 항상 새로 복사
      //    - BUILD_LOCK_KEY로 빌드가 직렬화되므로 동시성 문제 없음
      const nodeModulesPath = join(result.buildDir, 'node_modules');
      let cacheMode = 'none';
      let cacheFallbackReason = null;

      if (existsSync(STARLIGHT_CACHE_NODE_MODULES)) {
        try {
          if (existsSync(nodeModulesPath)) {
            await rm(nodeModulesPath, { recursive: true, force: true });
          }
          // cp -r 사용: fs.cp보다 빠르고 퍼미션/심볼릭 링크 유지가 자연스러움
          await execa('cp', ['-r', STARLIGHT_CACHE_NODE_MODULES, nodeModulesPath], {
            timeout: 300000,
          });
          cacheMode = 'copy';
        } catch (copyErr) {
          cacheFallbackReason = `복사 실패: ${copyErr.message}`;
          console.warn('[buildStarlight] 공용 캐시 복사 실패, npm install 폴백:', copyErr.message);
        }
      } else {
        cacheFallbackReason = `공용 캐시 없음 (${STARLIGHT_CACHE_NODE_MODULES})`;
      }

      if (cacheMode === 'none') {
        // 폴백: 링크 실패 또는 이미지에 캐시가 없는 환경 (예: 로컬 개발 초기)
        if (!existsSync(nodeModulesPath)) {
          console.warn('[buildStarlight] npm install 폴백 실행:', cacheFallbackReason);
          await execa('npm', ['install', '--no-audit', '--no-fund', '--prefer-offline'], {
            cwd: result.buildDir,
            timeout: 600000,
            stdio: 'pipe',
            shell: true,
          });
          cacheMode = 'npm-install';
        }
      }

      // 4) astro build
      const build = await execa('npx', ['astro', 'build'], {
        cwd: result.buildDir,
        timeout: 600000,
        stdio: 'pipe',
        shell: true,
      });

      // 5) dist/ → site/ 교체
      const distDir = join(result.buildDir, 'dist');
      if (!existsSync(distDir)) {
        throw new Error('astro build 후 dist/ 폴더가 없습니다');
      }
      await rm(this.sitePath, { recursive: true, force: true });
      await cp(distDir, this.sitePath, { recursive: true });

      // 6) .nojekyll (GitHub Pages 호환)
      await writeFile(join(this.sitePath, '.nojekyll'), '', 'utf-8');

      // 7) 빌드 캐시 정리 — Fly Volume 용량 보호.
      //    generateStarlightProject가 매번 buildDir을 rm -rf 후 재생성하므로
      //    캐시를 남겨도 재활용되지 않는다. site/로 복사가 끝났으니 삭제 안전.
      //    .starlight-build/ 전체 제거 (복사된 node_modules 포함).
      let cleanupSavedBytes = 0;
      try {
        const before = await import('fs/promises').then((m) => m.stat(result.buildDir)).catch(() => null);
        await rm(result.buildDir, { recursive: true, force: true });
        if (before) cleanupSavedBytes = before.size || 0;
      } catch (cleanupErr) {
        // 청소 실패는 빌드 결과를 망치지 않도록 swallow
        console.warn('[buildStarlight] 빌드 캐시 정리 실패(무시):', cleanupErr.message);
      }

      return {
        success: true,
        theme: 'starlight',
        message: `Starlight 빌드 완료 (${result.chapterCount}개 챕터, ${result.imageCount}개 이미지)`,
        chapterCount: result.chapterCount,
        imageCount: result.imageCount,
        stdout: build.stdout?.slice(-2000) || '',
        cleanupSavedBytes,
        cacheMode, // 'copy' | 'npm-install' — Step 5 빌드 시간 진단용
      };
    } catch (e) {
      // 실패 시에는 buildDir을 남겨둬서 디버깅 가능하도록 한다.
      return {
        success: false,
        theme: 'starlight',
        message: e.shortMessage || e.message,
        error: e.stderr?.slice(-2000) || e.stack,
      };
    }
  }

  /**
   * MkDocs 로컬 서버 시작 (기존 프로세스 정리 후 실행)
   */
  async serveLocal(port = 8000) {
    try {
      // 해당 포트의 기존 프로세스 종료
      try {
        const { stdout } = await execa('lsof', ['-ti', `:${port}`]);
        if (stdout.trim()) {
          for (const pid of stdout.trim().split('\n')) {
            try { process.kill(Number(pid), 'SIGTERM'); } catch { /* ignore */ }
          }
          // 프로세스 종료 대기
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch { /* 포트 사용 중인 프로세스 없음 */ }

      const { cmd, args } = await this._resolveCmd('mkdocs');
      const subprocess = execa(cmd, [...args, 'serve', '--dev-addr', `127.0.0.1:${port}`], {
        cwd: this.projectPath,
        detached: true,
        stdio: 'ignore',
        shell: true,
      });
      // 비동기 실패 시 unhandled rejection 방지
      subprocess.catch(() => {});
      subprocess.unref();
      return { success: true, url: `http://localhost:${port}`, pid: subprocess.pid };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  /**
   * DOCX 생성 — pandoc 우선, 실패 시 JS 폴백
   */
  async generateDocx(title = '교육자료') {
    const chapters = await this.getChapterFiles();
    if (chapters.length === 0) {
      return { success: false, message: '챕터 파일이 없습니다' };
    }

    // 챕터를 하나의 마크다운으로 합치기
    const tocFile = join(this.projectPath, 'toc.json');
    let tocData = null;
    if (existsSync(tocFile)) {
      try { tocData = JSON.parse(await readFile(tocFile, 'utf-8')); } catch { /* skip */ }
    }

    let combined = `# ${title}\n\n`;
    if (tocData) {
      if (tocData.description) combined += `${tocData.description}\n\n`;
      if (tocData.target_audience) combined += `**대상 독자**: ${tocData.target_audience}\n\n`;
      combined += '---\n\n';
    }

    for (const ch of chapters) {
      const content = await readFile(ch.path, 'utf-8');
      combined += content + '\n\n---\n\n';
    }

    const outputFile = join(this.outputPath, `${title}.docx`);

    // 1차: pandoc 시도
    try {
      const tempMd = join(this.projectPath, 'temp_combined.md');
      await writeFile(tempMd, combined, 'utf-8');

      const { cmd: pCmd, args: pArgs } = await this._resolveCmd('pandoc');
      await execa(pCmd, [...pArgs,
        tempMd, '-o', outputFile,
        '--toc', '--highlight-style', 'tango',
      ], { timeout: 120000 });

      try { await unlink(tempMd); } catch { /* skip */ }

      const fileStat = await stat(outputFile);
      const sizeMb = fileStat.size / 1024 / 1024;

      return {
        success: true,
        file_path: outputFile,
        file_name: `${title}.docx`,
        size_mb: Math.round(sizeMb * 100) / 100,
        engine: 'pandoc',
      };
    } catch (pandocErr) {
      console.warn('[Deployment] pandoc 실패, JS 폴백 사용:', pandocErr.shortMessage || pandocErr.message);
    }

    // 2차: JS 기반 DOCX 생성 폴백
    try {
      const buffer = await markdownToDocx(combined, title);
      await writeFile(outputFile, buffer);

      const fileStat = await stat(outputFile);
      const sizeMb = fileStat.size / 1024 / 1024;

      return {
        success: true,
        file_path: outputFile,
        file_name: `${title}.docx`,
        size_mb: Math.round(sizeMb * 100) / 100,
        engine: 'js',
      };
    } catch (jsErr) {
      return {
        success: false,
        message: `DOCX 생성 실패: ${jsErr.message}`,
        error: jsErr.stack,
      };
    }
  }

  /**
   * GitHub 사용자 확인
   */
  async getGitHubUser() {
    try {
      const result = await execa('gh', ['api', 'user', '--jq', '.login']);
      return { success: true, username: result.stdout.trim() };
    } catch {
      return { success: false, message: 'GitHub에 로그인되어 있지 않습니다' };
    }
  }

  /**
   * 포트폴리오 저장소(eduflow-portfolio)의 projects.json 자동 갱신
   */
  async updatePortfolio(repoName, siteUrl, repoUrl, username, creator = null) {
    const portfolioRepo = `${username}/eduflow-portfolio`;

    try {
      // 현재 projects.json 가져오기
      let projects = [];
      let sha = null;
      try {
        const { stdout } = await execa('gh', [
          'api', `repos/${portfolioRepo}/contents/projects.json`,
          '--jq', '.content + "\\n" + .sha',
        ]);
        const lines = stdout.trim().split('\n');
        sha = lines.pop();
        const base64Content = lines.join('');
        projects = JSON.parse(Buffer.from(base64Content, 'base64').toString('utf-8'));
      } catch {
        // 포트폴리오 저장소나 파일이 없으면 빈 배열
      }

      // 프로젝트 메타데이터 로드
      const configPath = join(this.projectPath, 'config.json');
      let config = {};
      if (existsSync(configPath)) {
        try { config = JSON.parse(await readFile(configPath, 'utf-8')); } catch { /* skip */ }
      }

      // 챕터 수 및 페이지 수 계산
      const chapters = await this.getChapterFiles();
      let totalChars = 0;
      for (const ch of chapters) {
        try {
          const s = await stat(ch.path);
          totalChars += s.size;
        } catch { /* skip */ }
      }
      const pages = totalChars > 0 ? Math.max(1, Math.round(totalChars / 1800)) : 0;

      // 기존 항목 업데이트 또는 새로 추가
      const entry = {
        name: repoName,
        title: config.title || repoName,
        description: config.description || '',
        url: siteUrl,
        repoUrl,
        createdAt: config.created_at || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isEduflow: true,
        chapters: chapters.length,
        pages,
        ...(creator?.name && { creatorName: creator.name }),
        ...(creator?.affiliation && { creatorAffiliation: creator.affiliation }),
      };

      const idx = projects.findIndex((p) => p.name === repoName);
      if (idx >= 0) {
        projects[idx] = { ...projects[idx], ...entry };
      } else {
        projects.unshift(entry);
      }

      // projects.json 업데이트 (GitHub API)
      const content = Buffer.from(JSON.stringify(projects, null, 2)).toString('base64');
      const apiArgs = [
        'api', `repos/${portfolioRepo}/contents/projects.json`,
        '-X', 'PUT',
        '-f', `message=Update portfolio: ${config.title || repoName}`,
        '-f', `content=${content}`,
      ];
      if (sha) apiArgs.push('-f', `sha=${sha}`);

      await execa('gh', apiArgs);

      return { success: true, message: '포트폴리오가 자동 갱신되었습니다' };
    } catch (e) {
      // 포트폴리오 갱신 실패는 배포 자체를 실패시키지 않음
      return { success: false, message: `포트폴리오 갱신 실패: ${e.message}` };
    }
  }

  /**
   * GitHub Pages 배포
   */
  async deployToGitHub(repoName, creator = null) {
    const userResult = await this.getGitHubUser();
    if (!userResult.success) {
      return { success: false, message: userResult.message };
    }
    const username = userResult.username;

    try {
      // README.md 생성
      const readmePath = join(this.projectPath, 'README.md');
      const configPath = join(this.projectPath, 'config.json');
      let projConfig = {};
      if (existsSync(configPath)) {
        try { projConfig = JSON.parse(await readFile(configPath, 'utf-8')); } catch { /* skip */ }
      }
      const projTitle = projConfig.title || repoName;
      const projDesc = projConfig.description || '';
      const pub = projConfig.publishing || {};
      const pubName = pub.publisher || creator?.name || '';
      const pubDate = pub.published_date || new Date().toISOString().split('T')[0];
      const pubReviewers = pub.reviewers || [];

      let readme = `# ${projTitle}\n\n`;
      if (projDesc) readme += `${projDesc}\n\n`;
      readme += `## 발행 정보\n\n`;
      if (pubName) readme += `- **발행인**: ${pubName}\n`;
      if (creator?.affiliation) readme += `- **소속**: ${creator.affiliation}\n`;
      readme += `- **발행일**: ${pubDate}\n`;
      readme += `- **검토**: ${pubReviewers.length > 0 ? pubReviewers.join(', ') : '미검토'}\n`;
      readme += `- **도구**: [EduFlow](https://eduflow-greatsong.fly.dev/) — AI 교육자료 생성 플랫폼\n`;
      readme += `\n## 수정 안내\n\n`;
      readme += `이 교재는 GitHub에서 직접 수정할 수 있습니다.\n\n`;
      readme += `1. \`docs/\` 폴더에서 마크다운 파일을 편집하세요\n`;
      readme += `2. 수정 후 커밋하면 GitHub Pages가 자동으로 업데이트됩니다\n`;
      readme += `3. 검토 완료 후 README.md의 검토 항목을 업데이트하세요\n`;
      readme += `\n---\n\n> 이 교육자료는 [EduFlow](https://eduflow-greatsong.fly.dev/)를 사용하여 제작되었습니다.\n`;
      await writeFile(readmePath, readme, 'utf-8');

      // Git 초기화 (없으면)
      if (!existsSync(join(this.projectPath, '.git'))) {
        await execa('git', ['init'], { cwd: this.projectPath });
        await execa('git', ['add', '.'], { cwd: this.projectPath });
        await execa('git', ['commit', '-m', 'Initial commit'], { cwd: this.projectPath });
      }

      // 저장소 존재 확인
      let repoExists = false;
      try {
        await execa('gh', ['repo', 'view', `${username}/${repoName}`]);
        repoExists = true;
      } catch { /* 없음 */ }

      const repoUrl = `https://github.com/${username}/${repoName}.git`;

      if (!repoExists) {
        // 저장소 생성
        try {
          await execa('git', ['remote', 'remove', 'origin'], { cwd: this.projectPath });
        } catch { /* 없을 수 있음 */ }
        await execa('gh', ['repo', 'create', repoName, '--public', '--source=.', '--remote=origin'], { cwd: this.projectPath });
      } else {
        // remote 설정
        try {
          await execa('git', ['remote', 'set-url', 'origin', repoUrl], { cwd: this.projectPath });
        } catch {
          await execa('git', ['remote', 'add', 'origin', repoUrl], { cwd: this.projectPath });
        }
      }

      // Discussions 활성화
      try {
        await execa('gh', ['api', '-X', 'PATCH', `repos/${username}/${repoName}`, '-f', 'has_discussions=true']);
      } catch { /* 실패해도 배포에 영향 없음 */ }

      // mkdocs gh-deploy
      const { cmd: mkCmd, args: mkArgs } = await this._resolveCmd('mkdocs');
      await execa(mkCmd, [...mkArgs, 'gh-deploy', '--force'], { cwd: this.projectPath, timeout: 180000, shell: true });

      const siteUrl = `https://${username}.github.io/${repoName}/`;
      return {
        success: true,
        site_url: siteUrl,
        repo_url: `https://github.com/${username}/${repoName}`,
        username,
      };
    } catch (e) {
      return { success: false, message: e.shortMessage || e.message, error: e.stderr };
    }
  }

  // =============================================
  // GitHub API 기반 배포 (사용자 토큰 사용)
  // =============================================

  /**
   * GitHub API 헬퍼: 인증 헤더 포함한 fetch
   */
  async _githubFetch(url, token, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'EduFlow',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.headers || {}),
      },
    });
    return res;
  }

  /**
   * GitHub API 기반 배포 — 사용자의 토큰으로 리포 생성 및 site/ 폴더 push
   * @param {string} repoName - 저장소 이름
   * @param {string} githubToken - 사용자의 GitHub access token
   * @param {object|null} creator - 제작자 정보 { name, affiliation }
   */
  async deployToGitHubAPI(repoName, githubToken, creator = null) {
    try {
      // 1. GitHub 사용자 정보 가져오기
      const userRes = await this._githubFetch('https://api.github.com/user', githubToken);
      if (!userRes.ok) {
        return { success: false, message: 'GitHub 토큰이 유효하지 않습니다.' };
      }
      const githubUser = await userRes.json();
      const username = githubUser.login;

      console.log(`[EduFlow] GitHub API 배포 시작: ${username}/${repoName}`);

      // 2. 배포 대상 URL에 맞게 재빌드
      //    미리보기 빌드는 siteUrl=''·basePath='/'로 생성돼 GitHub Pages(/<repo>/)에서
      //    CSS·JS 경로가 전부 404 난다. 배포 직전에 siteUrl/basePath를 박아 다시 빌드.
      //    (변수명은 이 함수 뒷부분의 반환용 siteUrl과 충돌 방지를 위해 astro* prefix)
      const astroSiteUrl = `https://${username}.github.io`;
      const astroBasePath = `/${repoName}/`;

      let theme = 'starlight';
      let siteName = repoName;
      let colorTheme = 'sky';
      let accentColor;
      const configPath = join(this.projectPath, 'config.json');
      if (existsSync(configPath)) {
        try {
          const cfg = JSON.parse(await readFile(configPath, 'utf-8'));
          theme = cfg.deployment?.theme || 'starlight';
          siteName = cfg.title || repoName;
          colorTheme = cfg.deployment?.color_theme || 'sky';
          accentColor = cfg.deployment?.accent_color;
        } catch { /* skip */ }
      }

      console.log(`[EduFlow] 배포용 재빌드: base=${astroBasePath}, site=${astroSiteUrl}`);
      const rebuild = await this.buildWebsite({
        theme, siteName, creator, colorTheme, accentColor,
        siteUrl: astroSiteUrl, basePath: astroBasePath,
      });
      if (!rebuild.success) {
        return { success: false, message: `배포 직전 재빌드 실패: ${rebuild.message}` };
      }

      // 3. site/ 폴더 확인
      if (!existsSync(this.sitePath)) {
        return { success: false, message: '빌드된 사이트(site/)가 없습니다. 먼저 웹사이트 빌드를 실행하세요.' };
      }

      // 3. 리포 존재 확인 → 없으면 생성
      const repoCheckRes = await this._githubFetch(
        `https://api.github.com/repos/${username}/${repoName}`,
        githubToken
      );

      if (repoCheckRes.status === 404) {
        // 리포 생성
        const createRes = await this._githubFetch(
          'https://api.github.com/user/repos',
          githubToken,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: repoName,
              description: `EduFlow로 생성된 교육자료`,
              homepage: `https://${username}.github.io/${repoName}/`,
              private: false,
              auto_init: true,
              has_discussions: true,
            }),
          }
        );

        if (!createRes.ok) {
          const err = await createRes.json();
          return { success: false, message: `리포 생성 실패: ${err.message}` };
        }

        console.log(`[EduFlow] 새 리포 생성됨: ${username}/${repoName}`);

        // auto_init 후 GitHub 초기화 완료 대기 (Git Data API 사용 가능 상태까지)
        await new Promise((r) => setTimeout(r, 2000));
      } else if (!repoCheckRes.ok) {
        return { success: false, message: '리포 확인 중 오류가 발생했습니다.' };
      } else {
        // 리포가 존재하지만 비어있을 수 있음 (이전에 auto_init: false로 생성된 경우)
        await this._ensureRepoInitialized(username, repoName, githubToken);
      }

      // 4. site/ 폴더의 모든 파일 수집
      const files = await this._collectSiteFiles(this.sitePath);
      if (files.length === 0) {
        return { success: false, message: 'site/ 폴더에 파일이 없습니다.' };
      }

      console.log(`[EduFlow] ${files.length}개 파일 push 준비 중...`);

      // 5. Git Data API로 push (gh-pages 브랜치)
      await this._pushViaGitDataAPI(username, repoName, githubToken, files);

      // 6. GitHub Pages 활성화
      await this._enableGitHubPages(username, repoName, githubToken);

      const siteUrl = `https://${username}.github.io/${repoName}/`;
      const repoUrl = `https://github.com/${username}/${repoName}`;

      console.log(`[EduFlow] GitHub API 배포 완료: ${siteUrl}`);

      return {
        success: true,
        site_url: siteUrl,
        repo_url: repoUrl,
        username,
      };
    } catch (e) {
      console.error('[EduFlow] GitHub API 배포 오류:', e);
      return { success: false, message: `배포 실패: ${e.message}` };
    }
  }

  /**
   * site/ 폴더의 모든 파일을 재귀적으로 수집
   * @returns {Array<{ path: string, content: Buffer }>}
   */
  async _collectSiteFiles(dir, baseDir = null) {
    if (!baseDir) baseDir = dir;
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await this._collectSiteFiles(fullPath, baseDir);
        files.push(...subFiles);
      } else {
        const relPath = relative(baseDir, fullPath);
        const content = await readFile(fullPath);
        files.push({ path: relPath, content });
      }
    }

    return files;
  }

  /**
   * Git Data API를 사용하여 gh-pages 브랜치에 파일 push
   */
  async _pushViaGitDataAPI(owner, repo, token, files) {
    const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

    // 1. 기존 gh-pages ref 확인
    let parentCommitSha = null;
    let baseTreeSha = null;

    const refRes = await this._githubFetch(`${apiBase}/git/ref/heads/gh-pages`, token);
    if (refRes.ok) {
      const refData = await refRes.json();
      parentCommitSha = refData.object.sha;

      // 기존 커밋의 tree SHA 가져오기
      const commitRes = await this._githubFetch(`${apiBase}/git/commits/${parentCommitSha}`, token);
      if (commitRes.ok) {
        const commitData = await commitRes.json();
        baseTreeSha = commitData.tree.sha;
      }
    }

    // 2. 모든 파일의 blob 생성 (동시성 제한)
    const BATCH_SIZE = 10;
    const treeItems = [];

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const blobResults = await Promise.all(
        batch.map(async (file) => {
          const blobRes = await this._githubFetch(`${apiBase}/git/blobs`, token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: file.content.toString('base64'),
              encoding: 'base64',
            }),
          });

          if (!blobRes.ok) {
            const err = await blobRes.json();
            throw new Error(`Blob 생성 실패 (${file.path}): ${err.message}`);
          }

          const blobData = await blobRes.json();
          return {
            path: file.path,
            mode: '100644',
            type: 'blob',
            sha: blobData.sha,
          };
        })
      );
      treeItems.push(...blobResults);
    }

    // 3. Tree 생성
    const treeBody = { tree: treeItems };
    // base_tree를 설정하지 않으면 완전히 새로운 tree가 되어 이전 파일이 삭제됨
    // 우리는 site/ 전체를 교체하므로 base_tree 없이 새로 생성
    const treeRes = await this._githubFetch(`${apiBase}/git/trees`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(treeBody),
    });

    if (!treeRes.ok) {
      const err = await treeRes.json();
      throw new Error(`Tree 생성 실패: ${err.message}`);
    }

    const treeData = await treeRes.json();

    // 4. Commit 생성
    const commitBody = {
      message: `Deploy via EduFlow (${new Date().toISOString()})`,
      tree: treeData.sha,
      ...(parentCommitSha ? { parents: [parentCommitSha] } : { parents: [] }),
    };

    const commitRes = await this._githubFetch(`${apiBase}/git/commits`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commitBody),
    });

    if (!commitRes.ok) {
      const err = await commitRes.json();
      throw new Error(`Commit 생성 실패: ${err.message}`);
    }

    const commitData = await commitRes.json();

    // 5. Ref 업데이트 또는 생성
    if (parentCommitSha) {
      // 기존 ref 업데이트
      const updateRes = await this._githubFetch(`${apiBase}/git/refs/heads/gh-pages`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: commitData.sha, force: true }),
      });

      if (!updateRes.ok) {
        const err = await updateRes.json();
        throw new Error(`Ref 업데이트 실패: ${err.message}`);
      }
    } else {
      // 새 ref 생성
      const createRefRes = await this._githubFetch(`${apiBase}/git/refs`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'refs/heads/gh-pages', sha: commitData.sha }),
      });

      if (!createRefRes.ok) {
        const err = await createRefRes.json();
        throw new Error(`Ref 생성 실패: ${err.message}`);
      }
    }

    console.log(`[EduFlow] Git push 완료: ${files.length}개 파일, commit ${commitData.sha.slice(0, 7)}`);
  }

  /**
   * 리포가 비어있으면 초기 커밋 생성 (Contents API 사용)
   */
  async _ensureRepoInitialized(owner, repo, token) {
    const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

    // main 브랜치의 커밋 목록 확인
    const commitsRes = await this._githubFetch(`${apiBase}/commits?per_page=1`, token);

    if (commitsRes.status === 409 || commitsRes.status === 404) {
      // 409 = "Git Repository is empty" — 커밋이 하나도 없음
      console.log(`[EduFlow] 빈 리포 감지, 초기 커밋 생성 중: ${owner}/${repo}`);

      // Contents API로 README 파일 생성 (빈 리포에서도 작동)
      const initRes = await this._githubFetch(`${apiBase}/contents/README.md`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Initial commit via EduFlow',
          content: Buffer.from(`# ${repo}\n\nEduFlow로 생성된 교육자료\n`).toString('base64'),
        }),
      });

      if (!initRes.ok) {
        const err = await initRes.json();
        throw new Error(`빈 리포 초기화 실패: ${err.message}`);
      }

      console.log(`[EduFlow] 빈 리포 초기화 완료: ${owner}/${repo}`);
      // 초기화 후 Git Data API 사용 가능 상태까지 대기
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  /**
   * GitHub Pages 활성화 (gh-pages 브랜치 기반)
   */
  async _enableGitHubPages(owner, repo, token) {
    const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

    // 현재 Pages 설정 확인
    const pagesRes = await this._githubFetch(`${apiBase}/pages`, token);

    if (pagesRes.status === 404) {
      // Pages가 아직 활성화되지 않음 → 활성화
      const enableRes = await this._githubFetch(`${apiBase}/pages`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: { branch: 'gh-pages', path: '/' },
        }),
      });

      if (!enableRes.ok && enableRes.status !== 409) {
        // 409 = 이미 활성화됨 (동시 요청 등)
        const err = await enableRes.json().catch(() => ({}));
        console.warn(`[EduFlow] Pages 활성화 경고: ${err.message || enableRes.status}`);
      } else {
        console.log(`[EduFlow] GitHub Pages 활성화 완료`);
      }
    } else if (pagesRes.ok) {
      // 이미 활성화됨 — source가 gh-pages인지 확인하고 필요시 업데이트
      const pagesData = await pagesRes.json();
      if (pagesData.source?.branch !== 'gh-pages') {
        await this._githubFetch(`${apiBase}/pages`, token, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: { branch: 'gh-pages', path: '/' },
          }),
        });
      }
    }
  }

  /**
   * 포트폴리오 저장소 갱신 (GitHub API 사용, 서버 토큰)
   * 사용자 자체 배포 시에도 포트폴리오는 서버 관리자의 토큰으로 업데이트
   * @param {string} repoName - 배포된 리포 이름
   * @param {string} siteUrl - 배포된 사이트 URL
   * @param {string} repoUrl - GitHub 리포 URL
   * @param {string} githubUsername - 배포 사용자의 GitHub 사용자명
   * @param {object|null} creator - 제작자 정보
   */
  async updatePortfolioAPI(repoName, siteUrl, repoUrl, githubUsername, creator = null) {
    const portfolioToken = process.env.PORTFOLIO_GITHUB_TOKEN;
    if (!portfolioToken) {
      return { success: false, message: '포트폴리오 업데이트용 GitHub 토큰이 설정되지 않았습니다.' };
    }

    const portfolioRepo = `${PORTFOLIO_REPO_OWNER}/${PORTFOLIO_REPO_NAME}`;

    try {
      // 현재 projects.json 가져오기
      let projects = [];
      let sha = null;

      const fileRes = await this._githubFetch(
        `https://api.github.com/repos/${portfolioRepo}/contents/projects.json`,
        portfolioToken
      );

      if (fileRes.ok) {
        const fileData = await fileRes.json();
        sha = fileData.sha;
        projects = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));
      }

      // 프로젝트 메타데이터 로드
      const configPath = join(this.projectPath, 'config.json');
      let config = {};
      if (existsSync(configPath)) {
        try { config = JSON.parse(await readFile(configPath, 'utf-8')); } catch { /* skip */ }
      }

      // 챕터 수 및 페이지 수 계산
      const chapters = await this.getChapterFiles();
      let totalChars = 0;
      for (const ch of chapters) {
        try {
          const s = await stat(ch.path);
          totalChars += s.size;
        } catch { /* skip */ }
      }
      const pages = totalChars > 0 ? Math.max(1, Math.round(totalChars / 1800)) : 0;

      // 엔트리 구성
      const entry = {
        name: repoName,
        title: config.title || repoName,
        description: config.description || '',
        url: siteUrl,
        repoUrl,
        createdAt: config.created_at || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isEduflow: true,
        chapters: chapters.length,
        pages,
        githubUsername,
        ...(creator?.name && { creatorName: creator.name }),
        ...(creator?.affiliation && { creatorAffiliation: creator.affiliation }),
      };

      const idx = projects.findIndex((p) => p.name === repoName);
      if (idx >= 0) {
        projects[idx] = { ...projects[idx], ...entry };
      } else {
        projects.unshift(entry);
      }

      // projects.json 업데이트 (GitHub Contents API)
      const content = Buffer.from(JSON.stringify(projects, null, 2)).toString('base64');
      const updateBody = {
        message: `Update portfolio: ${config.title || repoName}`,
        content,
        ...(sha && { sha }),
      };

      const updateRes = await this._githubFetch(
        `https://api.github.com/repos/${portfolioRepo}/contents/projects.json`,
        portfolioToken,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateBody),
        }
      );

      if (!updateRes.ok) {
        const err = await updateRes.json();
        return { success: false, message: `포트폴리오 갱신 실패: ${err.message}` };
      }

      return { success: true, message: '포트폴리오가 자동 갱신되었습니다' };
    } catch (e) {
      return { success: false, message: `포트폴리오 갱신 실패: ${e.message}` };
    }
  }
}
