import { readFile, writeFile, readdir, stat, mkdir, unlink, copyFile, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync, createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import { execa } from 'execa';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class Deployment {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.docsPath = join(projectPath, 'docs');
    this.outputPath = join(projectPath, 'output');
    this.sitePath = join(projectPath, 'site');
    this.starlightPath = join(projectPath, '_starlight');
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
  async generateMkdocsConfig(siteName, theme = 'material') {
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

    // 커스텀 CSS 복사
    const stylesDir = join(this.docsPath, 'stylesheets');
    if (!existsSync(stylesDir)) await mkdir(stylesDir, { recursive: true });
    const customCssSource = join(__dirname, '..', 'assets', 'mkdocs-custom.css');
    if (existsSync(customCssSource)) {
      await copyFile(customCssSource, join(stylesDir, 'custom.css'));
    }

    // 커스텀 JS 복사 (헤더 제목 클릭 → 홈 이동)
    const jsDir = join(this.docsPath, 'javascripts');
    if (!existsSync(jsDir)) await mkdir(jsDir, { recursive: true });
    const titleLinkJsSource = join(__dirname, '..', 'assets', 'mkdocs-title-link.js');
    if (existsSync(titleLinkJsSource)) {
      await copyFile(titleLinkJsSource, join(jsDir, 'title-link.js'));
    }

    const config = `site_name: "${siteName}"
site_description: "${desc}"
site_author: Created with EduFlow

theme:
  name: ${theme}
  language: ko
  palette:
    - media: "(prefers-color-scheme: light)"
      scheme: default
      primary: indigo
      accent: deep purple
      toggle:
        icon: material/brightness-7
        name: "\uB2E4\uD06C \uBAA8\uB4DC\uB85C \uC804\uD658"
    - media: "(prefers-color-scheme: dark)"
      scheme: slate
      primary: indigo
      accent: deep purple
      toggle:
        icon: material/brightness-4
        name: "\uB77C\uC774\uD2B8 \uBAA8\uB4DC\uB85C \uC804\uD658"
  font:
    text: Noto Sans KR
    code: JetBrains Mono
  features:
    - navigation.tabs
    - navigation.sections
    - navigation.top
    - navigation.indexes
    - search.suggest
    - search.highlight
    - content.code.copy
    - content.code.annotate
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
  - pymdownx.emoji:
      emoji_index: !!python/name:material.extensions.emoji.twemoji
      emoji_generator: !!python/name:material.extensions.emoji.to_svg
  - attr_list
  - md_in_html
  - def_list

extra_javascript:
  - https://unpkg.com/mermaid@10/dist/mermaid.min.js
  - javascripts/title-link.js

extra_css:
  - stylesheets/custom.css

docs_dir: docs
site_dir: site

nav:
${navYaml}`;

    await writeFile(join(this.projectPath, 'mkdocs.yml'), config, 'utf-8');

    // index.md 생성 (없으면)
    const indexPath = join(this.docsPath, 'index.md');
    if (!existsSync(indexPath)) {
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
   * DOCX 생성 (pandoc)
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

    const tempMd = join(this.projectPath, 'temp_combined.md');
    const outputFile = join(this.outputPath, `${title}.docx`);

    try {
      await writeFile(tempMd, combined, 'utf-8');

      const { cmd: pCmd, args: pArgs } = await this._resolveCmd('pandoc');
      await execa(pCmd, [...pArgs,
        tempMd, '-o', outputFile,
        '--toc', '--highlight-style', 'tango',
      ], { timeout: 120000, shell: true });

      // 임시 파일 삭제
      try { await unlink(tempMd); } catch { /* skip */ }

      const fileStat = await stat(outputFile);
      const sizeMb = fileStat.size / 1024 / 1024;

      return {
        success: true,
        file_path: outputFile,
        file_name: `${title}.docx`,
        size_mb: Math.round(sizeMb * 100) / 100,
      };
    } catch (e) {
      try { await unlink(tempMd); } catch { /* skip */ }
      return { success: false, message: e.shortMessage || e.message, error: e.stderr };
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
  async updatePortfolio(repoName, siteUrl, repoUrl, username) {
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

  // =============================================
  // Starlight 관련 메서드
  // =============================================

  /**
   * 마크다운을 Starlight 호환 형식으로 변환
   */
  _convertToStarlight(markdown) {
    let content = markdown;

    // pymdownx admonition -> Starlight aside
    content = content.replace(
      /^!!! (\w+)(?: "([^"]*)")?\s*\n((?:    .+\n?)*)/gm,
      (_, type, title, body) => {
        const typeMap = { note: 'note', tip: 'tip', warning: 'caution', danger: 'danger', info: 'note', success: 'tip', example: 'note' };
        const starlightType = typeMap[type] || 'note';
        const cleanBody = body.replace(/^    /gm, '');
        return title
          ? `:::${starlightType}[${title}]\n${cleanBody}:::\n`
          : `:::${starlightType}\n${cleanBody}:::\n`;
      }
    );

    // ??? collapsible admonition -> aside
    content = content.replace(
      /^\?\?\?[+]? (\w+)(?: "([^"]*)")?\s*\n((?:    .+\n?)*)/gm,
      (_, type, title, body) => {
        const typeMap = { note: 'note', tip: 'tip', warning: 'caution', danger: 'danger', info: 'note' };
        const starlightType = typeMap[type] || 'note';
        const cleanBody = body.replace(/^    /gm, '');
        return title
          ? `:::${starlightType}[${title}]\n${cleanBody}:::\n`
          : `:::${starlightType}\n${cleanBody}:::\n`;
      }
    );

    return content;
  }

  /**
   * frontmatter 추가/갱신
   */
  _addFrontmatter(content, title, order) {
    const stripped = content.replace(/^---\n[\s\S]*?\n---\n*/, '');
    const fm = `---\ntitle: "${title.replace(/"/g, '\\"')}"\nsidebar:\n  order: ${order}\n---\n\n`;
    return fm + stripped;
  }

  /**
   * Starlight 프로젝트 스캐폴딩 생성
   */
  async generateStarlightProject(siteName, repoName, username) {
    const tocFile = join(this.projectPath, 'toc.json');
    let tocData = null;
    if (existsSync(tocFile)) {
      try { tocData = JSON.parse(await readFile(tocFile, 'utf-8')); } catch { /* skip */ }
    }

    const chapters = await this.getChapterFiles();
    if (chapters.length === 0) {
      return { success: false, message: '챕터 파일이 없습니다' };
    }

    const slPath = this.starlightPath;

    // node_modules 보존을 위해 src/ 만 재생성
    const srcPath = join(slPath, 'src');
    if (existsSync(srcPath)) {
      await rm(srcPath, { recursive: true, force: true });
    }
    await mkdir(join(slPath, 'src', 'content', 'docs'), { recursive: true });
    await mkdir(join(slPath, 'src', 'styles'), { recursive: true });

    // 파트별 디렉토리 생성 + 챕터 복사
    let globalOrder = 1;

    if (tocData) {
      for (const part of tocData.parts || []) {
        const partDir = `part-${part.part_number}`;
        const partPath = join(slPath, 'src', 'content', 'docs', partDir);
        await mkdir(partPath, { recursive: true });

        let chapterOrder = 1;
        for (const ch of part.chapters || []) {
          const srcFile = join(this.docsPath, `${ch.chapter_id}.md`);
          if (!existsSync(srcFile)) continue;

          let content = await readFile(srcFile, 'utf-8');
          content = this._convertToStarlight(content);
          content = this._addFrontmatter(content, ch.chapter_title, chapterOrder);

          const destFile = join(partPath, `${ch.chapter_id}.md`);
          await writeFile(destFile, content, 'utf-8');
          chapterOrder++;
          globalOrder++;
        }
      }
    } else {
      for (const ch of chapters) {
        let content = await readFile(ch.path, 'utf-8');
        content = this._convertToStarlight(content);
        content = this._addFrontmatter(content, ch.title, globalOrder);
        const destFile = join(slPath, 'src', 'content', 'docs', `${ch.id}.md`);
        await writeFile(destFile, content, 'utf-8');
        globalOrder++;
      }
    }

    // sidebar config
    const sidebarEntries = [];
    if (tocData) {
      for (const part of tocData.parts || []) {
        const partDir = `part-${part.part_number}`;
        const label = `Part ${part.part_number}: ${part.part_title}`;
        sidebarEntries.push(`          {\n            label: '${label.replace(/'/g, "\\'")}',\n            autogenerate: { directory: '${partDir}' },\n          }`);
      }
    } else {
      sidebarEntries.push(`          {\n            label: '목차',\n            autogenerate: { directory: '.' },\n          }`);
    }

    const basePath = repoName ? `/${repoName}` : '';
    const siteUrlBase = username ? `https://${username}.github.io` : 'https://example.github.io';

    // astro.config.mjs
    const astroConfig = `import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: '${siteUrlBase}',
  base: '${basePath}',
  integrations: [
    starlight({
      title: '${siteName.replace(/'/g, "\\'")}',
      defaultLocale: 'root',
      locales: {
        root: { label: '한국어', lang: 'ko' },
      },
      sidebar: [
${sidebarEntries.join(',\n')}
      ],
      customCss: ['./src/styles/custom.css'],
    }),
  ],
});
`;
    await writeFile(join(slPath, 'astro.config.mjs'), astroConfig, 'utf-8');

    // package.json
    const pkgJson = {
      name: repoName || 'starlight-docs',
      type: 'module',
      version: '0.0.1',
      scripts: {
        dev: 'astro dev',
        start: 'astro dev',
        build: 'astro build',
        preview: 'astro preview',
        astro: 'astro',
      },
      dependencies: {
        astro: '^5.6.0',
        '@astrojs/starlight': '^0.34.0',
        sharp: '^0.33.0',
      },
    };
    await writeFile(join(slPath, 'package.json'), JSON.stringify(pkgJson, null, 2), 'utf-8');

    // tsconfig.json
    await writeFile(join(slPath, 'tsconfig.json'), JSON.stringify({
      extends: 'astro/tsconfigs/strict',
    }, null, 2), 'utf-8');

    // content.config.ts
    const contentConfig = `import { defineCollection } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({ schema: docsSchema() }),
};
`;
    await writeFile(join(slPath, 'src', 'content.config.ts'), contentConfig, 'utf-8');

    // custom.css (ai-physical-computing 디자인 기반)
    const customCss = `@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css');

:root {
  /* 메인 색상 */
  --sl-color-accent-low: #0d3d38;
  --sl-color-accent: #4ECDC4;
  --sl-color-accent-high: #a8e6e1;

  /* 폰트 */
  --sl-font: 'Pretendard Variable', 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
  --sl-font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* 텍스트 */
  --sl-text-2xl: 1.75rem;
  --sl-text-3xl: 2rem;
  --sl-text-4xl: 2.5rem;

  /* 콘텐츠 너비 */
  --sl-content-width: 48rem;
}

/* 다크 모드 색상 */
:root[data-theme='dark'] {
  --sl-color-accent-low: #0d3d38;
  --sl-color-accent: #4ECDC4;
  --sl-color-accent-high: #a8e6e1;
}

/* 팁 박스 */
.tip-box {
  border-left: 4px solid #FFE66D;
  background: rgba(255, 230, 109, 0.08);
  padding: 1rem 1.25rem;
  border-radius: 0 0.5rem 0.5rem 0;
  margin: 1rem 0;
}

/* 질문 박스 */
.question-box {
  border-left: 4px solid #4ECDC4;
  background: rgba(78, 205, 196, 0.08);
  padding: 1rem 1.25rem;
  border-radius: 0 0.5rem 0.5rem 0;
  margin: 1rem 0;
  font-style: italic;
}

/* 난이도 표시 */
.difficulty-dots span.filled {
  color: #4ECDC4;
}
.difficulty-dots span.empty {
  color: #4a5568;
}

/* 체크리스트 진행 바 */
.progress-bar {
  background: rgba(78, 205, 196, 0.2);
  border-radius: 9999px;
  height: 0.5rem;
  overflow: hidden;
}
.progress-bar-fill {
  background: #4ECDC4;
  height: 100%;
  transition: width 0.3s ease;
}

/* 코드 블록 줄별 해설 */
.code-annotation {
  background: rgba(78, 205, 196, 0.1);
  border-left: 2px solid #4ECDC4;
  padding: 0.25rem 0.75rem;
  margin: 0.25rem 0;
  font-size: 0.85rem;
  border-radius: 0 0.25rem 0.25rem 0;
}

/* 메타 뱃지 */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
}
.badge-mint {
  background: rgba(78, 205, 196, 0.15);
  color: #4ECDC4;
}
.badge-coral {
  background: rgba(255, 107, 107, 0.15);
  color: #FF6B6B;
}
.badge-yellow {
  background: rgba(255, 230, 109, 0.15);
  color: #d4a810;
}
.badge-slate {
  background: rgba(148, 163, 184, 0.15);
  color: #94a3b8;
}
`;
    await writeFile(join(slPath, 'src', 'styles', 'custom.css'), customCss, 'utf-8');

    // index.mdx (splash page)
    const desc = tocData?.description || siteName;
    const firstChapterId = tocData?.parts?.[0]?.chapters?.[0]?.chapter_id;
    const startLink = firstChapterId
      ? `${basePath}/part-1/${firstChapterId}/`.replace(/\/+/g, '/')
      : '#';

    let indexContent = `---
title: "${siteName.replace(/"/g, '\\"')}"
template: splash
hero:
  tagline: "${desc.replace(/"/g, '\\"')}"
  actions:
    - text: 학습 시작
      link: ${startLink}
      icon: right-arrow
---

## 목차

`;

    if (tocData) {
      for (const part of tocData.parts || []) {
        indexContent += `### Part ${part.part_number}: ${part.part_title}\n\n`;
        for (const ch of part.chapters || []) {
          if (existsSync(join(this.docsPath, `${ch.chapter_id}.md`))) {
            indexContent += `- [${ch.chapter_title}](${basePath}/part-${part.part_number}/${ch.chapter_id}/)\n`;
          }
        }
        indexContent += '\n';
      }
    }

    await writeFile(join(slPath, 'src', 'content', 'docs', 'index.mdx'), indexContent, 'utf-8');

    return {
      success: true,
      starlightPath: slPath,
      chapterCount: globalOrder - 1,
      message: `Starlight 프로젝트 생성 완료 (${globalOrder - 1}개 챕터)`,
    };
  }

  /**
   * Starlight npm install
   */
  async installStarlight() {
    try {
      await execa('npm', ['install'], {
        cwd: this.starlightPath,
        timeout: 300000,
      });
      return { success: true, message: '의존성 설치 완료' };
    } catch (e) {
      return { success: false, message: e.shortMessage || e.message };
    }
  }

  /**
   * Starlight 빌드
   */
  async buildStarlight() {
    try {
      const astroCache = join(this.starlightPath, '.astro');
      if (existsSync(astroCache)) {
        await rm(astroCache, { recursive: true, force: true });
      }

      const result = await execa('npm', ['run', 'build'], {
        cwd: this.starlightPath,
        timeout: 300000,
      });
      return { success: true, message: '빌드 성공', stdout: result.stdout };
    } catch (e) {
      return { success: false, message: e.shortMessage || e.message, error: e.stderr };
    }
  }

  /**
   * Starlight 로컬 프리뷰
   */
  async serveStarlight(port = 4321) {
    try {
      try {
        const { stdout } = await execa('lsof', ['-ti', `:${port}`]);
        if (stdout.trim()) {
          for (const pid of stdout.trim().split('\n')) {
            try { process.kill(Number(pid), 'SIGTERM'); } catch { /* ignore */ }
          }
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch { /* 포트 사용 중인 프로세스 없음 */ }

      const subprocess = execa('npm', ['run', 'preview', '--', '--port', String(port)], {
        cwd: this.starlightPath,
        detached: true,
        stdio: 'ignore',
      });
      subprocess.catch(() => {});
      subprocess.unref();
      return { success: true, url: `http://localhost:${port}`, pid: subprocess.pid };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  /**
   * Starlight GitHub Pages 배포
   */
  async deployStarlightToGitHub(repoName) {
    const userResult = await this.getGitHubUser();
    if (!userResult.success) {
      return { success: false, message: userResult.message };
    }
    const username = userResult.username;

    const distPath = join(this.starlightPath, 'dist');
    if (!existsSync(distPath)) {
      return { success: false, message: '빌드된 파일이 없습니다. 먼저 빌드를 실행하세요.' };
    }

    try {
      let repoExists = false;
      try {
        await execa('gh', ['repo', 'view', `${username}/${repoName}`]);
        repoExists = true;
      } catch { /* 없음 */ }

      if (!repoExists) {
        await execa('gh', ['repo', 'create', repoName, '--public']);
      }

      const gitDir = join(distPath, '.git');
      if (existsSync(gitDir)) {
        await rm(gitDir, { recursive: true, force: true });
      }

      await execa('git', ['init'], { cwd: distPath });
      await execa('git', ['add', '.'], { cwd: distPath });
      await execa('git', ['commit', '-m', 'Deploy Starlight site'], { cwd: distPath });
      await execa('git', ['branch', '-M', 'gh-pages'], { cwd: distPath });
      await execa('git', ['remote', 'add', 'origin', `https://github.com/${username}/${repoName}.git`], { cwd: distPath });
      await execa('git', ['push', '-f', 'origin', 'gh-pages'], { cwd: distPath });

      try {
        await execa('gh', ['api', '-X', 'PUT', `repos/${username}/${repoName}/pages`,
          '-f', 'source[branch]=gh-pages', '-f', 'source[path]=/',
        ]);
      } catch {
        try {
          await execa('gh', ['api', '-X', 'POST', `repos/${username}/${repoName}/pages`,
            '-f', 'source[branch]=gh-pages', '-f', 'source[path]=/',
          ]);
        } catch { /* Pages가 이미 활성화됨 */ }
      }

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

  /**
   * GitHub Pages 배포
   */
  async deployToGitHub(repoName) {
    const userResult = await this.getGitHubUser();
    if (!userResult.success) {
      return { success: false, message: userResult.message };
    }
    const username = userResult.username;

    try {
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
