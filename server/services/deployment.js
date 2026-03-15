import { readFile, writeFile, readdir, stat, mkdir, unlink, copyFile } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync, createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import { execa } from 'execa';
import { markdownToDocx } from './docxGenerator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
   */
  async checkTools() {
    const [mkdocs, pandoc, git, gh] = await Promise.all([
      this.checkTool('mkdocs'),
      this.checkTool('pandoc'),
      this.checkTool('git'),
      this.checkTool('gh'),
    ]);
    return { mkdocs, pandoc, git, gh };
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
    const jsFiles = [
      { src: 'mkdocs-title-link.js', dest: 'title-link.js' },
      { src: 'mermaid-config.js', dest: 'mermaid-config.js' },
      { src: 'scroll-progress.js', dest: 'scroll-progress.js' },
    ];
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

      // 제작자 정보
      if (creatorName || creatorAffiliation) {
        indexContent += '\n---\n\n';
        indexContent += '!!! info "제작 정보"\n';
        if (creatorName) indexContent += `    **제작자**: ${creatorName}\n`;
        if (creatorAffiliation) indexContent += `    **소속**: ${creatorAffiliation}\n`;
        indexContent += `    **도구**: [EduFlow](https://eduflow-greatsong.fly.dev/) — AI 교육자료 생성 플랫폼\n`;
      }

      await writeFile(indexPath, indexContent, 'utf-8');
    }

    return { success: true, configPath: join(this.projectPath, 'mkdocs.yml') };
  }

  /**
   * MkDocs 빌드
   */
  async buildWebsite() {
    try {
      const { cmd, args } = await this._resolveCmd('mkdocs');
      const result = await execa(cmd, [...args, 'build'], {
        cwd: this.projectPath,
        timeout: 120000,
        shell: true,
      });
      return { success: true, message: '빌드 성공', stdout: result.stdout };
    } catch (e) {
      return { success: false, message: e.shortMessage || e.message, error: e.stderr };
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
      let readme = `# ${projTitle}\n\n`;
      if (projDesc) readme += `${projDesc}\n\n`;
      if (creator?.name || creator?.affiliation) {
        readme += `## 제작 정보\n\n`;
        if (creator.name) readme += `- **제작자**: ${creator.name}\n`;
        if (creator.affiliation) readme += `- **소속**: ${creator.affiliation}\n`;
        readme += `- **도구**: [EduFlow](https://eduflow-greatsong.fly.dev/) — AI 교육자료 생성 플랫폼\n`;
        readme += `- **생성일**: ${new Date().toLocaleDateString('ko-KR')}\n`;
      }
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
}
