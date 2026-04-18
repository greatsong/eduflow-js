/**
 * Astro Starlight 사이트 빌더 — 에듀플로 v1용
 *
 * eduflow2의 astroProjectGenerator.js (ZIP 생성형)를 v1의 파일 시스템 구조에
 * 맞게 포팅한 버전. JSZip 대신 디스크에 직접 쓴다.
 *
 * 입력:
 *   - projectPath/config.json   (title, description 등)
 *   - projectPath/toc.json      (parts[].chapters[] 구조)
 *   - projectPath/docs/*.md     (생성된 챕터 Markdown)
 *   - projectPath/images/       (선택, 이미지 자산)
 *
 * 출력:
 *   - projectPath/.starlight-build/   (Astro 프로젝트 소스 트리)
 *     ├── package.json
 *     ├── astro.config.mjs
 *     ├── tsconfig.json
 *     ├── src/content/docs/*.mdx
 *     ├── src/styles/custom.css
 *     └── public/images/
 *
 * 이후 deployment.js의 _buildStarlight가:
 *   1. placeholder(__SITE__, __BASE__) 치환
 *   2. npm install (최초 1회)
 *   3. npx astro build
 *   4. dist/ → projectPath/site/ 복사
 *   5. .nojekyll 생성
 */

import { existsSync, readdirSync } from 'fs';
import { readFile, writeFile, mkdir, rm, copyFile } from 'fs/promises';
import { basename, join } from 'path';

// ============================================================
// 색상 테마 프리셋
// ============================================================
// 사용자가 Step 5에서 고를 수 있는 기본 팔레트.
// 각 엔트리는 Starlight CSS 변수(--sl-color-accent 계열)와
// 커스텀 컴포넌트용 --ef-accent/--ef-accent-bg로 매핑된다.

export const COLOR_THEMES = {
  sky: { // 기본값 — 밝고 시원한 하늘색
    label: '하늘색',
    accent: '#0EA5E9',
    accentBg: '#E0F2FE',
  },
  indigo: {
    label: '인디고',
    accent: '#4F46E5',
    accentBg: '#EEF2FF',
  },
  emerald: {
    label: '에메랄드',
    accent: '#10B981',
    accentBg: '#ECFDF5',
  },
  amber: {
    label: '앰버',
    accent: '#F59E0B',
    accentBg: '#FEF3C7',
  },
  rose: {
    label: '로즈',
    accent: '#E11D48',
    accentBg: '#FFE4E6',
  },
  slate: {
    label: '슬레이트',
    accent: '#64748B',
    accentBg: '#F1F5F9',
  },
};

export const DEFAULT_THEME_KEY = 'sky';

function resolveColorTheme(input) {
  if (typeof input === 'string' && COLOR_THEMES[input]) {
    return COLOR_THEMES[input];
  }
  // 사용자가 hex 색상을 직접 넘긴 경우
  if (typeof input === 'string' && /^#[0-9A-Fa-f]{6}$/.test(input)) {
    return { label: '사용자 지정', accent: input, accentBg: '#F1F5F9' };
  }
  if (input && typeof input === 'object' && input.accent) {
    return input;
  }
  return COLOR_THEMES[DEFAULT_THEME_KEY];
}

// ============================================================
// 유틸
// ============================================================

function safeName(value = 'project', fallbackId = 'project') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `project-${String(fallbackId).slice(0, 8)}`;
}

function toPosixPath(value = '') {
  return String(value).replace(/\\/g, '/').replace(/^\/+/, '');
}

/**
 * ASCII 박스(┌─┘ 등 박스 드로잉 문자)가 들어있는 코드블록을
 * <pre class="ef-ascii-box">로 치환해 Shiki의 Expressive Code 래퍼를 회피한다.
 *
 * 이유:
 *   - Expressive Code는 각 줄을 <div class="ec-line">로 감싸 line-height를 벌리기 때문에
 *     박스의 세로선(│)이 끊어져 보임 → "고장 난 것처럼" 보임
 *   - 어두운 네이비 배경이 본문과 이질감
 *
 * ASCII 박스 문자 감지:
 *   - 박스 드로잉 블록 (U+2500~U+257F)
 *   - ┌ ┐ └ ┘ ─ │ ├ ┤ ┬ ┴ ┼ 등
 */
/**
 * 문자의 시각적 너비를 반환 (East Asian Width 기반).
 * 한글·한자·전각 기호 = 2, ASCII·박스 드로잉 = 1.
 */
function visualWidth(ch) {
  const code = ch.codePointAt(0);
  if (code === undefined) return 0;
  // ASCII 영역 — 1칸
  if (code < 0x80) return 1;
  // Combining marks (폭 0)
  if ((code >= 0x0300 && code <= 0x036F) || (code >= 0x1AB0 && code <= 0x1AFF)) return 0;
  // 박스 드로잉 (U+2500-257F) — 1칸 (│, ─ 등 정밀하게 1칸 너비)
  if (code >= 0x2500 && code <= 0x257F) return 1;
  // Block Elements (U+2580-259F) — 1칸
  if (code >= 0x2580 && code <= 0x259F) return 1;
  // 기하 도형 (U+25A0-25FF) — 대부분 2칸으로 렌더됨 (모노스페이스 터미널 관행: East Asian "Ambiguous")
  //   예: ■ ● ○ ▶ ◆ 등. D2Coding 폰트에서도 2칸 차지.
  if (code >= 0x25A0 && code <= 0x25FF) return 2;
  // 기타 기호 (U+2600-26FF) — 대부분 이모지 계열, 2칸
  if (code >= 0x2600 && code <= 0x26FF) return 2;
  // 딩벳 (U+2700-27BF) — 2칸 (★, ✓ 등)
  if (code >= 0x2700 && code <= 0x27BF) return 2;
  // 화살표 (U+2190-21FF) — 1칸 (터미널 관행)
  if (code >= 0x2190 && code <= 0x21FF) return 1;
  // 수학 기호 (U+2200-22FF) — 1칸
  if (code >= 0x2200 && code <= 0x22FF) return 1;
  // CJK 통합 한자 확장 A (U+3400-4DBF)
  if (code >= 0x3400 && code <= 0x4DBF) return 2;
  // CJK 통합 한자 (U+4E00-9FFF)
  if (code >= 0x4E00 && code <= 0x9FFF) return 2;
  // 한글 호환 자모 (U+3130-318F), 한글 자모 (U+1100-11FF)
  if ((code >= 0x1100 && code <= 0x11FF) || (code >= 0x3130 && code <= 0x318F)) return 2;
  // 한글 (U+AC00-D7A3)
  if (code >= 0xAC00 && code <= 0xD7A3) return 2;
  // 전각 숫자·알파벳·기호 (U+FF00-FFEF)
  if (code >= 0xFF00 && code <= 0xFFEF) return 2;
  // CJK 기호·구두점 (U+3000-303F)
  if (code >= 0x3000 && code <= 0x303F) return 2;
  // 가타카나·히라가나 (U+3040-30FF)
  if (code >= 0x3040 && code <= 0x30FF) return 2;
  // 원형 숫자·알파벳 (U+2460-24FF) — 2칸
  if (code >= 0x2460 && code <= 0x24FF) return 2;
  // 이모지 영역 (U+1F000+) — 2칸 (색상 원형 이모지 🟢🟡🔴 포함)
  if (code >= 0x1F000) return 2;
  return 1;
}

function lineVisualWidth(line) {
  let width = 0;
  // 서로게이트 페어 처리 위해 Array.from 사용
  for (const ch of Array.from(line)) {
    width += visualWidth(ch);
  }
  return width;
}

/**
 * ASCII 박스 라인들의 시각적 너비를 일치시킴.
 * 박스 드로잉 문자(│, ┌, └, ─ 등)가 있는 라인만 대상.
 * 박스 밖 라인(빈 줄, 설명)은 건드리지 않음.
 *
 * 알고리즘:
 * 1. 박스 드로잉 문자 포함 라인들의 시각적 너비 중 최빈값(mode)을 찾음
 * 2. 각 라인의 마지막 │ 앞에 공백을 추가/삭제해 너비 맞춤
 *    (끝이 ─, ┐, ┘, ┤ 등으로 끝나는 라인은 너비 조정만, 문자 교체 안 함)
 */
function normalizeAsciiBoxWidth(code) {
  const lines = code.split('\n');
  // 박스 라인(박스 드로잉 문자 포함)과 비박스 라인 분리
  const boxLineIndices = [];
  const widths = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (/[\u2500-\u257F]/.test(lines[i])) {
      boxLineIndices.push(i);
      widths.push(lineVisualWidth(lines[i]));
    }
  }
  if (boxLineIndices.length < 2) return code; // 박스 없음

  // 목표 너비: 최빈값 (가장 흔한 너비)
  const freq = new Map();
  for (const w of widths) freq.set(w, (freq.get(w) || 0) + 1);
  let targetWidth = widths[0];
  let maxFreq = 0;
  for (const [w, f] of freq) {
    if (f > maxFreq) { maxFreq = f; targetWidth = w; }
  }

  // 각 박스 라인의 너비를 targetWidth로 맞춤
  //
  // 일반화된 규칙:
  //   박스 라인 = [선두 장식] + [내부 콘텐츠] + [마지막 박스 드로잉 문자]
  //   → 마지막 박스 드로잉 문자(|, ┐, ┘, ┤, ┬, ┴, ┼ 등)는 그대로 두고,
  //     그 바로 앞의 문자에 따라 공백 또는 ─를 추가/제거.
  //
  //   콘텐츠 라인(끝이 │): 끝 공백 추가·제거
  //   테두리 라인(끝이 ┐/┘/┤/┬/┴/┼): ─ 추가·제거
  //   그 외: 수정 시도 금지 (텍스트 깨짐 방지)
  const BOX_END_FILLERS = {
    '│': ' ',
    '|': ' ',
    '┐': '─',
    '┘': '─',
    '┤': '─',
    '╗': '═',
    '╝': '═',
    '╣': '═',
    '┬': '─',
    '┴': '─',
    '┼': '─',
  };

  for (const idx of boxLineIndices) {
    const line = lines[idx];
    const w = lineVisualWidth(line);
    if (w === targetWidth) continue;

    const arr = Array.from(line);
    const lastChar = arr[arr.length - 1] || '';
    const filler = BOX_END_FILLERS[lastChar];
    if (!filler) continue; // 예상 못 한 끝 문자 → 건드리지 않음

    // 내부 콘텐츠(마지막 경계 문자 제외)의 현재 시각 너비
    const lastCharWidth = visualWidth(lastChar);
    const innerContent = arr.slice(0, -1).join('');
    const innerWidth = w - lastCharWidth;
    const targetInnerWidth = targetWidth - lastCharWidth;

    if (innerWidth < targetInnerWidth) {
      // 부족 → filler 추가
      const fillerWidth = visualWidth(filler);
      const needed = targetInnerWidth - innerWidth;
      // filler 하나가 2폭이면 홀수 차이는 맞추지 못함 → 가능한 만큼만
      const count = Math.floor(needed / fillerWidth);
      lines[idx] = innerContent + filler.repeat(count) + lastChar;
    } else if (innerWidth > targetInnerWidth) {
      // 초과 → 끝쪽에서 filler 제거 (연속으로)
      let trimmed = innerContent;
      const fillerWidth = visualWidth(filler);
      let currentWidth = innerWidth;
      while (currentWidth > targetInnerWidth && trimmed.endsWith(filler)) {
        trimmed = trimmed.slice(0, -filler.length);
        currentWidth -= fillerWidth;
      }
      // filler가 아니면(예: 한글이 바로 나오는 경우) 더 이상 제거 안 함
      lines[idx] = trimmed + lastChar;
    }
  }
  return lines.join('\n');
}

function rewriteAsciiBoxBlocks(markdown = '') {
  // 모든 fenced code block을 잡고, 내용에 박스 드로잉 문자가 있으면 치환
  // 언어 지정자(text/plain/plaintext/빈칸 등) 무관하게 매칭
  return markdown.replace(
    /```([^\n]*)\r?\n([\s\S]*?)```/g,
    (match, lang, code) => {
      const language = (lang || '').trim().toLowerCase();
      // 코드 언어가 지정된 경우(예: python, js, glowscript) 제외
      const unlabeledLangs = new Set(['', 'text', 'plain', 'plaintext', 'txt']);
      if (!unlabeledLangs.has(language)) return match;
      // 박스 드로잉 문자가 하나라도 있으면 치환
      if (!/[\u2500-\u257F]/.test(code)) return match;
      // 박스 너비 자동 정렬 (한글·영문 혼재 시 들쭉날쭉 방지)
      const normalized = normalizeAsciiBoxWidth(code);
      const escaped = normalized
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n$/, '');
      return `<pre class="ef-ascii-box"><code>${escaped}</code></pre>`;
    },
  );
}

/**
 * ```mermaid 코드블록을 <pre class="mermaid"> HTML로 직접 치환.
 *
 * 이유: Astro의 Shiki highlighter가 mermaid를 언어로 인식해 줄 단위 <span>/<div>로 감싸면
 *       클라이언트 사이드 JS가 textContent를 추출할 때 줄바꿈이 공백으로 압축됨
 *       → mermaid 파서가 "Syntax error in text" 발생.
 *
 *       Markdown 단계에서 raw HTML로 바꿔버리면 Shiki가 전혀 건드리지 않음 (HTML passthrough).
 *       클라이언트 JS가 <pre class="mermaid">를 그대로 찾아 <div class="ef-mermaid">로 교체.
 */
function rewriteMermaidBlocks(markdown = '') {
  return markdown.replace(
    /```mermaid\r?\n([\s\S]*?)```/g,
    (_, code) => {
      // HTML 이스케이프 — pre의 textContent에서 원문 그대로 복원되도록
      const escaped = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<pre class="mermaid">${escaped}</pre>`;
    },
  );
}

/**
 * Markdown 내부의 로컬 이미지 경로를 ${basePath}images/{basename}으로 정규화.
 * 외부 URL(https, data:)는 건드리지 않는다.
 *
 * 주의: 단순히 `/images/…`(절대 경로)로 만들면 GitHub Pages 서브 경로 배포 시
 *   실제 파일(/rhythm-.../images/…)을 찾지 못해 404.
 *   Astro Starlight의 Markdown 파이프라인은 절대 경로에 basePath를 자동 prepend하지 않으므로
 *   빌드 시점에 우리가 직접 박아 넣어야 한다.
 */
function rewriteLocalImageRefs(markdown = '', basePath = '/') {
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const normalize = (src = '') => {
    if (!src) return src;
    if (/^(https?:|data:)/i.test(src)) return src;
    return `${normalizedBase}images/${basename(src.split('?')[0].split('#')[0])}`;
  };

  const withMarkdownImages = markdown.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g,
    (_, alt, src, title) => `![${alt}](${normalize(src)}${title ? ` "${title}"` : ''})`
  );

  return withMarkdownImages.replace(
    /(<img[^>]+src=["'])([^"']+)(["'][^>]*>)/g,
    (_, prefix, src, suffix) => `${prefix}${normalize(src)}${suffix}`
  );
}

/**
 * MkDocs Material 관용 표기를 Starlight(asides) 문법으로 변환.
 * - !!! note "제목"     → :::note[제목]
 * - !!! warning         → :::caution
 * - !!! danger          → :::danger
 * - !!! tip / info      → :::tip / :::note
 * - ??? 접기형 admonition → :::note (펼친 상태로 표시)
 *
 * 주의: admonition 블록의 끝은 "첫 비-들여쓰기 라인"으로 판단 (mkdocs와 동일 규칙).
 */
function convertAdmonitions(markdown = '') {
  const lines = markdown.split('\n');
  const out = [];
  let insideAdmonition = false;

  const typeMap = {
    note: 'note',
    info: 'note',
    tip: 'tip',
    success: 'tip',
    question: 'note',
    warning: 'caution',
    caution: 'caution',
    danger: 'danger',
    error: 'danger',
    bug: 'danger',
    example: 'note',
    quote: 'note',
    abstract: 'note',
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const m = line.match(/^(\?\?\?|!!!)\s+(\w+)(?:\s+"([^"]*)")?\s*$/);
    if (m) {
      const [, , rawType, titleRaw] = m;
      const sType = typeMap[rawType.toLowerCase()] || 'note';
      const title = titleRaw ? `[${titleRaw}]` : '';
      if (insideAdmonition) out.push(':::');
      out.push(`:::${sType}${title}`);
      insideAdmonition = true;
      continue;
    }
    if (insideAdmonition) {
      if (line === '' || /^\s{2,}/.test(line) || /^\t/.test(line)) {
        // 들여쓰기 유지된 내용 라인 → 앞 공백 제거해서 그대로 넣기
        out.push(line.replace(/^(\s{2,}|\t)/, ''));
        continue;
      }
      // admonition 종료
      out.push(':::');
      out.push(line);
      insideAdmonition = false;
      continue;
    }
    out.push(line);
  }
  if (insideAdmonition) out.push(':::');
  return out.join('\n');
}

/**
 * 챕터 Markdown의 첫 `# 제목` 라인 제거 (frontmatter에 title로 들어가므로 중복 방지).
 */
function stripFirstH1(markdown = '') {
  const lines = markdown.split('\n');
  let removed = false;
  const out = [];
  for (const line of lines) {
    if (!removed && /^#\s+.+/.test(line)) {
      removed = true;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/**
 * 숫자 사이의 단일 틸드(`~`)를 대시(`-`)로 치환.
 *
 * 원인: AI가 `15~19점`, `1~2개` 처럼 범위 표기를 단일 틸드로 생성하면,
 *       GFM 파서가 인접한 틸드 쌍을 `~text~` strikethrough로 해석해
 *       "19점: 1" 같은 부분이 **취소선으로 렌더**되어 버림.
 *
 * 처리 규칙:
 *   - `숫자 ~ 숫자` 패턴만 변환 (범위 표기) → `숫자-숫자`
 *   - 코드 블록 내부는 건드리지 않음
 *   - 그 외 단일 틸드(음악 노트 `레~~` 등)는 그대로 두되, 코드가 아닌 곳에 있는 `~~`는
 *     strikethrough를 유발하므로 escape 처리
 */
function normalizeNumericRanges(markdown = '') {
  // 1) 코드 블록·인라인 코드 보호
  const codeBlocks = [];
  let text = markdown.replace(/```[\s\S]*?```/g, (m) => {
    codeBlocks.push(m);
    return `\u0000CB${codeBlocks.length - 1}\u0000`;
  });
  const inlineCodes = [];
  text = text.replace(/`[^`\n]+`/g, (m) => {
    inlineCodes.push(m);
    return `\u0000IC${inlineCodes.length - 1}\u0000`;
  });

  // 2) 숫자~숫자 범위 표기를 숫자-숫자로 변환
  //    (앞뒤 공백 허용: `15 ~ 19점`, `15~19점` 둘 다 처리)
  text = text.replace(/(\d)\s*~\s*(\d)/g, '$1-$2');

  // 3) 복원
  text = text.replace(/\u0000IC(\d+)\u0000/g, (_, i) => inlineCodes[Number(i)]);
  text = text.replace(/\u0000CB(\d+)\u0000/g, (_, i) => codeBlocks[Number(i)]);
  return text;
}

/**
 * GFM 파서가 깨지는 볼드 패턴을 <strong>으로 치환해 렌더링 안정성 확보.
 *
 * 주요 실패 케이스:
 *  - **"한국어 따옴표 안"** — 곡선 따옴표(“”")와 인접 시 일부 파서가 경계 못 잡음
 *  - 한국어**단어** 또는 **단어**한국어 — 한글·영문 단어 경계와 맞물리면 인식 실패
 *
 * 전략:
 *  - 인라인 볼드(`**...**`)를 정규식으로 잡아 `<strong>...</strong>` HTML로 교체
 *  - 코드 블록(``` ``` / 인라인 `code`)은 제외
 */
function normalizeInlineBold(markdown = '') {
  // 1) 코드 블록 보호: fenced code + inline code를 토큰으로 치환
  const codeBlocks = [];
  let text = markdown.replace(/```[\s\S]*?```/g, (m) => {
    codeBlocks.push(m);
    return `\u0000CODEBLOCK${codeBlocks.length - 1}\u0000`;
  });
  const inlineCodes = [];
  text = text.replace(/`[^`\n]+`/g, (m) => {
    inlineCodes.push(m);
    return `\u0000INLINECODE${inlineCodes.length - 1}\u0000`;
  });

  // 2) **X** 패턴을 <strong>X</strong>로 치환
  //    X 내부에 빈 내용(**) 금지, 줄바꿈 금지, 다른 **와 충돌 방지
  //    한국어·영문·숫자·구두점 모두 포함 가능 (lazy 매칭)
  text = text.replace(/\*\*(?!\s)([^\n*]+?)(?<!\s)\*\*/g, (_, inner) => {
    return `<strong>${inner}</strong>`;
  });

  // 3) 토큰 복원
  text = text.replace(/\u0000INLINECODE(\d+)\u0000/g, (_, i) => inlineCodes[Number(i)]);
  text = text.replace(/\u0000CODEBLOCK(\d+)\u0000/g, (_, i) => codeBlocks[Number(i)]);

  return text;
}

function buildFrontmatter(frontmatter = {}) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value == null || value === '') continue;
    lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

// ============================================================
// TOC 기반 사이드바·그룹 구성
// ============================================================

/**
 * docs 메타 + toc.json으로부터 파트별 그룹을 만든다.
 * @param {object} toc - parsed toc.json ({parts: [{part_number, part_title, chapters: [{chapter_id, chapter_title, ...}]}]})
 * @param {Array}  docs - [{ chapterId, title, slug }]
 */
function buildPartGroupsFromToc(toc, docs) {
  const byChapterId = new Map(docs.map((d) => [d.chapterId, d]));
  const groups = [];
  const used = new Set();

  if (Array.isArray(toc?.parts)) {
    for (const part of toc.parts) {
      const items = [];
      for (const chapterRef of part.chapters || []) {
        const chapterId = chapterRef.chapter_id || chapterRef.id;
        const doc = byChapterId.get(chapterId);
        if (!doc) continue;
        items.push(doc);
        used.add(doc.chapterId);
      }
      if (items.length > 0) {
        const partNumber = part.part_number ?? (groups.length + 1);
        const label = part.part_title
          ? `Part ${partNumber}. ${part.part_title}`
          : `Part ${partNumber}`;
        groups.push({ label, items });
      }
    }
  }

  // toc에 없는 챕터들 (예비 섹션)
  const remaining = docs.filter((d) => !used.has(d.chapterId));
  if (remaining.length > 0) {
    groups.push({ label: '차시', items: remaining });
  }
  return groups;
}

function buildSidebarFromGroups(groups) {
  // 주의: index 파일은 Starlight에서 특수하게 처리되어 slug로 참조하면
  // zod schema 파싱 에러가 발생한다. 홈 링크는 로고 클릭으로 접근 가능하므로
  // 사이드바에는 넣지 않는다.
  const sidebar = [];
  for (const group of groups) {
    sidebar.push({
      label: group.label,
      items: group.items.map((doc) => ({
        label: doc.title,
        slug: toPosixPath(doc.slug),
      })),
    });
  }
  return sidebar;
}

// ============================================================
// 파일 소스 빌더
// ============================================================

function buildAstroConfig({ title, sidebar }) {
  // site, base는 placeholder로 두고 deployment.js가 빌드 시점에 치환.
  // Mermaid는 클라이언트 사이드로 처리 (rehype-mermaid는 playwright 의존성이 무거움).
  //   → public/mermaid-init.js에서 shiki가 렌더링한 코드 블록을 런타임에 변환.
  return [
    "import { defineConfig } from 'astro/config';",
    "import starlight from '@astrojs/starlight';",
    '',
    'export default defineConfig({',
    "  site: '__SITE__',",
    "  base: '__BASE__',",
    '  markdown: {',
    '    // mermaid 언어는 shiki 하이라이팅 제외 → plain code block으로 유지 → JS가 교체',
    '    shikiConfig: { langs: [] },',
    '  },',
    '  integrations: [',
    '    starlight({',
    `      title: ${JSON.stringify(title)},`,
    "      defaultLocale: 'root',",
    '      locales: {',
    "        root: { label: '한국어', lang: 'ko' },",
    '      },',
    "      customCss: ['./src/styles/custom.css'],",
    "      favicon: '/favicon.svg',",
    '      head: [',
    "        { tag: 'script', attrs: { type: 'module', src: '__BASE__mermaid-init.js' } },",
    "        { tag: 'script', attrs: { type: 'module', src: '__BASE__toc-toggle.js' } },",
    '      ],',
    `      sidebar: ${JSON.stringify(sidebar, null, 8)},`,
    '    }),',
    '  ],',
    '});',
  ].join('\n');
}

/**
 * public/mermaid-init.js 내용 — 클라이언트 사이드 Mermaid 렌더러.
 *
 * 동작:
 * 1. 페이지 로드 후 `pre > code.language-mermaid` 또는 `code[data-language="mermaid"]` 찾기
 * 2. 각 블록을 `<div class="mermaid">...원본 텍스트...</div>`로 교체
 * 3. mermaid CDN에서 ESM import → `run()` 호출
 */
function buildMermaidInitScript() {
  return [
    "import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';",
    '',
    'function transformMermaidBlocks() {',
    '  // 우선순위: 1) Markdown 단계에서 치환된 pre.mermaid (줄바꿈 보존됨)',
    '  //          2) Shiki가 처리한 pre[data-language="mermaid"] (fallback)',
    '  const primaryBlocks = document.querySelectorAll("pre.mermaid");',
    '  const shikiBlocks = document.querySelectorAll(\'pre[data-language="mermaid"], pre > code.language-mermaid\');',
    '  const blocks = new Set([...primaryBlocks, ...shikiBlocks]);',
    '  let index = 0;',
    '  for (const el of blocks) {',
    '    const pre = el.tagName === "PRE" ? el : (el.closest("pre") || el);',
    '    // 원본 텍스트 추출 — pre.mermaid는 textContent에 줄바꿈 보존',
    '    const src = pre.textContent || "";',
    '    if (!src.trim()) continue;',
    '    const div = document.createElement("div");',
    '    div.className = "mermaid ef-mermaid";',
    '    div.id = `mermaid-${index++}`;',
    '    div.textContent = src;',
    '    pre.replaceWith(div);',
    '  }',
    '}',
    '',
    'function isDark() {',
    "  return document.documentElement.dataset.theme === 'dark';",
    '}',
    '',
    'function initMermaid() {',
    '  mermaid.initialize({',
    '    startOnLoad: false,',
    '    securityLevel: "loose",',
    '    theme: isDark() ? "dark" : "default",',
    '    themeVariables: {',
    '      fontFamily: "Pretendard Variable, Pretendard, system-ui, sans-serif",',
    '      fontSize: "14px",',
    '    },',
    '    flowchart: { htmlLabels: true, curve: "basis" },',
    '  });',
    '}',
    '',
    'async function renderAll() {',
    '  transformMermaidBlocks();',
    '  initMermaid();',
    '  try {',
    '    await mermaid.run({ querySelector: ".ef-mermaid" });',
    '  } catch (err) {',
    '    console.error("[mermaid] render failed:", err);',
    '  }',
    '}',
    '',
    "if (document.readyState === 'loading') {",
    "  document.addEventListener('DOMContentLoaded', renderAll);",
    '} else {',
    '  renderAll();',
    '}',
    '',
    '// 다크모드 토글 감지 — 전체 다시 렌더링',
    'new MutationObserver(() => {',
    '  const existing = document.querySelectorAll(".ef-mermaid");',
    '  if (existing.length === 0) return;',
    '  // 이미 렌더된 SVG를 다시 코드로 복원하는 건 복잡 → 페이지 새로고침 권장',
    '}).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });',
  ].join('\n');
}

/**
 * public/toc-toggle.js — 목차 접기/펼치기 상태 유지.
 *
 * 두 가지를 관리:
 * 1) 오른쪽 "On this page" TOC 전체 접기 (localStorage: ef-toc-right-collapsed)
 *    - TOC 헤더 옆에 토글 버튼 삽입
 *    - <html data-ef-toc-collapsed="true"> 속성으로 CSS가 본문 숨김
 *
 * 2) 왼쪽 사이드바 <details> 그룹 각각의 접힘 상태 (localStorage: ef-sidebar-group-<label>)
 *    - Starlight가 생성하는 details 요소의 토글 이벤트를 리스닝
 *    - 페이지 이동 후에도 해당 그룹의 펼침/접힘 상태가 그대로
 */
function buildTocToggleScript() {
  return [
    "const LS_RIGHT_TOC = 'ef-toc-right-collapsed';",
    "const LS_LEFT_SIDEBAR = 'ef-sidebar-left-collapsed';",
    "const LS_SIDEBAR_GROUP = 'ef-sidebar-group:';",
    '',
    '// ── 오른쪽 TOC 전체 접기 ───────────────────────────────────',
    'function applyRightTocState() {',
    '  const collapsed = localStorage.getItem(LS_RIGHT_TOC) === "1";',
    '  document.documentElement.dataset.efTocCollapsed = collapsed ? "true" : "false";',
    '  document.querySelectorAll(".ef-toc-hamburger").forEach((btn) => {',
    '    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");',
    '    btn.setAttribute("title", collapsed ? "목차 펼치기" : "목차 접기");',
    '    btn.setAttribute("aria-label", collapsed ? "목차 펼치기" : "목차 접기");',
    '  });',
    '}',
    '',
    'function toggleRightToc() {',
    '  const cur = localStorage.getItem(LS_RIGHT_TOC) === "1";',
    '  localStorage.setItem(LS_RIGHT_TOC, cur ? "0" : "1");',
    '  applyRightTocState();',
    '}',
    '',
    '// ── 왼쪽 사이드바 전체 접기 ────────────────────────────────',
    'function applyLeftSidebarState() {',
    '  const collapsed = localStorage.getItem(LS_LEFT_SIDEBAR) === "1";',
    '  document.documentElement.dataset.efSidebarCollapsed = collapsed ? "true" : "false";',
    '  document.querySelectorAll(".ef-sidebar-hamburger").forEach((btn) => {',
    '    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");',
    '    btn.setAttribute("title", collapsed ? "사이드바 펼치기" : "사이드바 접기");',
    '    btn.setAttribute("aria-label", collapsed ? "사이드바 펼치기" : "사이드바 접기");',
    '  });',
    '}',
    '',
    'function toggleLeftSidebar() {',
    '  const cur = localStorage.getItem(LS_LEFT_SIDEBAR) === "1";',
    '  localStorage.setItem(LS_LEFT_SIDEBAR, cur ? "0" : "1");',
    '  applyLeftSidebarState();',
    '}',
    '',
    'function injectHamburgerButton() {',
    '  // 오른쪽 TOC 햄버거',
    '  if (!document.querySelector(".ef-toc-hamburger")) {',
    '    const btn = document.createElement("button");',
    '    btn.type = "button";',
    '    btn.className = "ef-toc-hamburger";',
    '    btn.setAttribute("aria-controls", "starlight__on-this-page-nav");',
    '    btn.textContent = "\\u2630";',
    '    btn.addEventListener("click", (e) => { e.preventDefault(); toggleRightToc(); });',
    '    document.body.appendChild(btn);',
    '  }',
    '  // 왼쪽 사이드바 햄버거',
    '  if (!document.querySelector(".ef-sidebar-hamburger")) {',
    '    const btn = document.createElement("button");',
    '    btn.type = "button";',
    '    btn.className = "ef-sidebar-hamburger";',
    '    btn.textContent = "\\u2630";',
    '    btn.addEventListener("click", (e) => { e.preventDefault(); toggleLeftSidebar(); });',
    '    document.body.appendChild(btn);',
    '  }',
    '}',
    '',
    '// ── 왼쪽 사이드바 그룹 접힘 상태 유지 ───────────────────────',
    'function groupKeyFor(details) {',
    '  // summary 텍스트를 키로 (같은 그룹 라벨이면 모든 페이지에서 동일)',
    '  const summary = details.querySelector("summary");',
    '  const label = (summary?.textContent || "").trim().replace(/\\s+/g, " ");',
    '  return LS_SIDEBAR_GROUP + label;',
    '}',
    '',
    'function applySidebarState() {',
    '  document.querySelectorAll(".sidebar details, nav.sidebar details").forEach((d) => {',
    '    const key = groupKeyFor(d);',
    '    if (!key) return;',
    '    const saved = localStorage.getItem(key);',
    '    if (saved === "open") d.open = true;',
    '    else if (saved === "closed") d.open = false;',
    '  });',
    '}',
    '',
    'function bindSidebarListeners() {',
    '  document.querySelectorAll(".sidebar details, nav.sidebar details").forEach((d) => {',
    '    if (d.dataset.efBound === "1") return;',
    '    d.dataset.efBound = "1";',
    '    d.addEventListener("toggle", () => {',
    '      const key = groupKeyFor(d);',
    '      if (!key) return;',
    '      localStorage.setItem(key, d.open ? "open" : "closed");',
    '    });',
    '  });',
    '}',
    '',
    '// ── 초기화 + View Transitions(SPA) 대응 ────────────────────',
    'function init() {',
    '  injectHamburgerButton();',
    '  applyRightTocState();',
    '  applyLeftSidebarState();',
    '  applySidebarState();',
    '  bindSidebarListeners();',
    '}',
    '',
    "if (document.readyState === 'loading') {",
    "  document.addEventListener('DOMContentLoaded', init);",
    '} else {',
    '  init();',
    '}',
    '',
    '// Astro View Transitions 사용 시 페이지 전환 후에도 재실행',
    "document.addEventListener('astro:page-load', init);",
  ].join('\n');
}

function buildPackageJson(folderName) {
  // 주의: zod를 명시적으로 v3로 고정한다. Starlight 0.34는 zod v3 API를 사용하지만
  // npm의 자동 해석이 상위 dependency 충돌로 v4를 끌어오면 zod._zod.parse에서 실패.
  // (4.6 프로젝트가 작동했던 것은 해당 시점에 v4가 아직 public이 아니었기 때문)
  return JSON.stringify(
    {
      name: folderName,
      private: true,
      type: 'module',
      scripts: {
        dev: 'astro dev',
        build: 'astro build',
        preview: 'astro preview',
      },
      dependencies: {
        astro: '^5.6.0',
        '@astrojs/starlight': '^0.34.0',
        sharp: '^0.33.0',
        zod: '^3.25.0',
      },
    },
    null,
    2,
  );
}

/**
 * 에듀플로 파비콘 — emerald 책 + 체크.
 * 사용자 선택: 03번 디자인(책 + 체크) + 초록 계열(#10B981 emerald).
 * 16px에서도 책 실루엣과 체크가 식별되도록 단순화.
 */
function buildFaviconSvg() {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="EduFlow">',
    '  <rect width="64" height="64" rx="12" fill="#10B981"/>',
    '  <rect x="16" y="14" width="32" height="36" rx="3" fill="#ffffff"/>',
    '  <path d="M22 28 l6 6 l14 -14" stroke="#10B981" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    '</svg>',
    '',
  ].join('\n');
}

function buildTsConfig() {
  return JSON.stringify(
    {
      extends: 'astro/tsconfigs/strict',
      include: ['.astro/types.d.ts', '**/*'],
      exclude: ['dist'],
    },
    null,
    2,
  );
}

function buildContentConfig() {
  // Starlight 0.34는 legacy content collection API 사용.
  // docsLoader() 사용 시 zod v4 파싱 충돌 발생 → schema만 전달.
  return [
    "import { defineCollection } from 'astro:content';",
    "import { docsSchema } from '@astrojs/starlight/schema';",
    '',
    'export const collections = {',
    '  docs: defineCollection({ schema: docsSchema() }),',
    '};',
  ].join('\n');
}

function buildCustomCss({ accentColor = '#0EA5E9', accentBg = '#E0F2FE' }) {
  // 디자인 원칙 (2026-04-17 확정):
  //  - 그라데이션 금지. 모든 배경은 단색.
  //  - box-shadow는 최소화. 구분은 보더·색상으로.
  //  - 접기 UI는 .ef-toc-toggle 클래스로 일관.
  return [
    "@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css');",
    "@import url('https://cdn.jsdelivr.net/gh/Joungkyun/font-d2coding/d2coding.css');",
    '',
    ':root {',
    "  --sl-font: 'Pretendard Variable', 'Pretendard', system-ui, sans-serif;",
    "  --ef-mono: 'D2Coding', 'Nanum Gothic Coding', 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;",
    `  --ef-accent: ${accentColor};`,
    `  --ef-accent-bg: ${accentBg};`,
    '  --sl-color-accent: var(--ef-accent);',
    '  --sl-color-accent-low: color-mix(in srgb, var(--ef-accent) 18%, #0f172a);',
    '  --sl-color-accent-high: color-mix(in srgb, var(--ef-accent) 70%, white);',
    '  --sl-content-width: 52rem;',
    '  --ef-ink: #0f172a;',
    '  --ef-sub: #475569;',
    '  --ef-line: #e2e8f0;',
    '  --ef-surface: #ffffff;',
    '  --ef-page-bg: #fafbfc;',
    '  --ef-shadow-soft: 0 1px 3px rgba(15, 23, 42, 0.06);',
    '}',
    '',
    'html { scroll-behavior: smooth; }',
    '',
    'body {',
    '  background: var(--ef-page-bg);',
    '  color: var(--ef-ink);',
    '}',
    '',
    '.sl-markdown-content {',
    '  font-size: 1.05rem;',
    '  line-height: 1.88;',
    '  color: var(--ef-ink);',
    '}',
    '',
    '.sl-markdown-content h1 {',
    '  font-size: clamp(2.1rem, 4vw, 3rem);',
    '  font-weight: 800;',
    '  line-height: 1.12;',
    '  letter-spacing: -0.025em;',
    '}',
    '',
    '.sl-markdown-content h2 {',
    '  margin-top: 2.6rem;',
    '  font-size: clamp(1.55rem, 3vw, 2rem);',
    '  font-weight: 800;',
    '  color: color-mix(in srgb, var(--ef-accent) 64%, var(--ef-ink));',
    '  letter-spacing: -0.02em;',
    '}',
    '',
    '.sl-markdown-content h3 {',
    '  margin-top: 1.8rem;',
    '  font-size: 1.22rem;',
    '  font-weight: 750;',
    '}',
    '',
    '.sl-markdown-content strong {',
    '  color: color-mix(in srgb, var(--ef-accent) 58%, var(--ef-ink));',
    '  font-weight: 780;',
    '}',
    '',
    '.sl-markdown-content a {',
    '  color: var(--ef-accent);',
    '  text-underline-offset: 0.16em;',
    '}',
    '',
    '.sl-markdown-content blockquote {',
    '  border-inline-start: 4px solid var(--ef-accent);',
    '  background: var(--ef-accent-bg);',
    '  padding: 0.95rem 1.15rem;',
    '  border-radius: 0.5rem;',
    '  margin: 1.25rem 0;',
    '  box-shadow: none;',
    '}',
    '',
    '.sl-markdown-content hr {',
    '  border: none;',
    '  height: 1px;',
    '  background: var(--ef-line);',
    '  margin: 2rem 0;',
    '}',
    '',
    '.sl-markdown-content table {',
    '  width: 100%;',
    '  border-collapse: separate;',
    '  border-spacing: 0;',
    '  border-radius: 0.5rem;',
    '  overflow: hidden;',
    '  border: 1px solid var(--ef-line);',
    '  background: var(--ef-surface);',
    '  box-shadow: none;',
    '}',
    '',
    '.sl-markdown-content thead th {',
    '  background: var(--ef-accent-bg);',
    '  color: color-mix(in srgb, var(--ef-accent) 62%, var(--ef-ink));',
    '  font-weight: 800;',
    '}',
    '',
    '.sl-markdown-content td, .sl-markdown-content th {',
    '  padding: 0.9rem 1rem;',
    '  border-bottom: 1px solid var(--ef-line);',
    '}',
    '',
    '.sl-markdown-content tr:last-child td { border-bottom: none; }',
    '',
    '.sl-markdown-content tbody tr:nth-child(even) td {',
    '  background: #f8fafc;',
    '}',
    '',
    '.sl-markdown-content img {',
    '  display: block;',
    '  margin: 1.4rem auto;',
    '  max-width: 100%;',
    '  border-radius: 0.5rem;',
    '  border: 1px solid var(--ef-line);',
    '  box-shadow: var(--ef-shadow-soft);',
    '}',
    '',
    '.sl-markdown-content pre, .expressive-code {',
    '  border-radius: 0.5rem !important;',
    '  border: 1px solid var(--ef-line) !important;',
    '  box-shadow: none;',
    '}',
    '',
    '.sl-markdown-content li::marker {',
    '  color: color-mix(in srgb, var(--ef-accent) 80%, #64748b);',
    '}',
    '',
    '@media (max-width: 768px) {',
    '  .sl-markdown-content { font-size: 0.98rem; }',
    '  .sl-markdown-content table { display: block; overflow-x: auto; }',
    '}',
    '',
    "[data-theme='dark'] {",
    '  --ef-page-bg: #0b1120;',
    '  --ef-surface: #111827;',
    '  --ef-line: #1f2937;',
    '  --ef-ink: #e5e7eb;',
    '  --ef-sub: #9ca3af;',
    '}',
    '',
    "[data-theme='dark'] body { background: var(--ef-page-bg); }",
    '',
    "[data-theme='dark'] .sl-markdown-content table {",
    '  background: var(--ef-surface);',
    '  border-color: var(--ef-line);',
    '}',
    '',
    "[data-theme='dark'] .sl-markdown-content tbody tr:nth-child(even) td {",
    '  background: #0f172a;',
    '}',
    '',
    "[data-theme='dark'] .sl-markdown-content blockquote {",
    '  background: color-mix(in srgb, var(--ef-accent) 18%, #0b1120);',
    '}',
    '',
    '/* ASCII 박스 (┌─┘ 등) — 치트시트·워크시트용 */',
    '.ef-ascii-box {',
    '  margin: 1.4rem 0;',
    '  padding: 0.9rem 1rem;',
    '  background: #f8fafc;',
    '  border: 1px solid var(--ef-line);',
    '  border-radius: 0.5rem;',
    '  overflow-x: auto;',
    '}',
    '',
    '.ef-ascii-box code {',
    '  font-family: var(--ef-mono);',      // D2Coding 우선 (한글 등폭)
    '  font-size: 0.86rem;',
    '  line-height: 1.3;',                  // 박스 선 끊김 방지
    '  color: #1e293b;',                   // slate-800, 깨끗한 단색
    '  background: transparent;',
    '  padding: 0;',
    '  display: block;',
    '  white-space: pre;',                 // 공백·줄바꿈 원본 그대로
    '  tab-size: 2;',
    '  font-variant-numeric: tabular-nums;',
    '  font-feature-settings: "halt" off;',
    '}',
    '',
    "[data-theme='dark'] .ef-ascii-box {",
    '  background: #0f172a;',
    '  border-color: var(--ef-line);',
    '}',
    '',
    "[data-theme='dark'] .ef-ascii-box code {",
    '  color: #e2e8f0;',
    '}',
    '',
    '/* Mermaid 다이어그램 */',
    '.ef-mermaid {',
    '  display: flex;',
    '  justify-content: center;',
    '  margin: 1.6rem 0;',
    '  padding: 1rem;',
    '  background: var(--ef-surface);',
    '  border-radius: 0.5rem;',
    '  border: 1px solid var(--ef-line);',
    '  box-shadow: none;',
    '  overflow-x: auto;',
    '}',
    '',
    '.ef-mermaid svg {',
    '  max-width: 100%;',
    '  height: auto;',
    '}',
    '',
    "[data-theme='dark'] .ef-mermaid {",
    '  background: var(--ef-surface);',
    '  border-color: var(--ef-line);',
    '}',
    '',
    '/* 생성 도구 푸터 (index 페이지 하단) */',
    '.ef-publish-footer {',
    '  margin-top: 2.5rem;',
    '  padding-top: 1rem;',
    '  border-top: 1px solid var(--ef-line);',
    '  font-size: 0.86rem;',
    '  color: var(--ef-sub);',
    '  text-align: center;',
    '}',
    '',
    '.ef-publish-footer a {',
    '  color: var(--ef-sub);',
    '  text-decoration: underline;',
    '  text-underline-offset: 0.2em;',
    '}',
    '',
    '/* ============================================================',
    '   목차 접기 UI — 햄버거 버튼(floating) + 왼쪽 사이드바 그룹 persistence',
    '   상태는 localStorage로 페이지 이동에도 유지 (public/toc-toggle.js).',
    '   ============================================================ */',
    '',
    '/* 햄버거 버튼(양쪽 공통) — 우측/좌측 상단 fixed, 항상 보임. */',
    '.ef-toc-hamburger, .ef-sidebar-hamburger {',
    '  position: fixed;',
    '  top: 4.25rem;',
    '  z-index: 90;',
    '  display: inline-flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  width: 2.25rem;',
    '  height: 2.25rem;',
    '  padding: 0;',
    '  font-size: 1.15rem;',
    '  line-height: 1;',
    '  color: var(--ef-sub);',
    '  background: var(--ef-surface);',
    '  border: 1px solid var(--ef-line);',
    '  border-radius: 0.375rem;',
    '  cursor: pointer;',
    '}',
    '',
    '.ef-toc-hamburger { right: 1.25rem; }',
    '.ef-sidebar-hamburger { left: 1.25rem; }',
    '',
    '.ef-toc-hamburger:hover, .ef-sidebar-hamburger:hover {',
    '  color: var(--ef-accent);',
    '  border-color: var(--ef-accent);',
    '}',
    '',
    '.ef-toc-hamburger:focus-visible, .ef-sidebar-hamburger:focus-visible {',
    '  outline: 2px solid var(--ef-accent);',
    '  outline-offset: 2px;',
    '}',
    '',
    '/* 1200px 이하(72rem): Starlight가 양쪽 사이드바를 자동으로 모바일 UI로 전환하므로',
    '   커스텀 햄버거는 숨김 (중복 방지). */',
    '@media (max-width: 72rem) {',
    '  .ef-toc-hamburger, .ef-sidebar-hamburger { display: none; }',
    '}',
    '',
    '/* 오른쪽 TOC 접힘: 컨테이너 제거 → 본문 확장 */',
    '[data-ef-toc-collapsed="true"] .right-sidebar-container {',
    '  display: none !important;',
    '}',
    '',
    '/* 왼쪽 사이드바 접힘: nav 제거 → 본문 확장 */',
    '[data-ef-sidebar-collapsed="true"] .sidebar {',
    '  display: none !important;',
    '}',
    '',
    '/* 양쪽 중 하나라도 접히면 본문 max-width 확장 */',
    '[data-ef-toc-collapsed="true"],',
    '[data-ef-sidebar-collapsed="true"] {',
    '  --sl-content-width: 68rem;',
    '}',
    '',
    '/* 양쪽 다 접히면 더 넓게 */',
    '[data-ef-toc-collapsed="true"][data-ef-sidebar-collapsed="true"] {',
    '  --sl-content-width: 78rem;',
    '}',
    '',
    '/* 왼쪽 사이드바 그룹 헤더에 커서 힌트 */',
    '.sidebar details > summary {',
    '  cursor: pointer;',
    '  user-select: none;',
    '}',
    '',
    '/* 햄버거 버튼이 사이드바 상단 첫 아이템을 가리지 않도록 여백 확보.',
    '   햄버거 높이 2.25rem + 여유 0.75rem = 3rem. 72rem 이하에서는 햄버거가 숨겨지므로 여백 불필요. */',
    '@media (min-width: 72rem) {',
    '  .sidebar-pane { padding-top: 3rem; }',
    '  .right-sidebar-panel { padding-top: 3rem; }',
    '}',
    '',
    '/* 오른쪽 TOC — 카테고리(최상위 li, h2에 해당) 볼드 강조 */',
    '.right-sidebar-panel li:not(li li) > a,',
    'starlight-toc li:not(li li) > a,',
    'mobile-starlight-toc li:not(li li) > a {',
    '  font-weight: 700;',
    '  color: var(--ef-ink);',
    '}',
    '',
    '/* 서브 레벨은 기본 굵기·색 */',
    '.right-sidebar-panel li li > a,',
    'starlight-toc li li > a,',
    'mobile-starlight-toc li li > a {',
    '  font-weight: 400;',
    '  color: var(--ef-sub);',
    '}',
  ].join('\n');
}

function buildIndexBody(projectConfig, groups, basePath = '/') {
  const title = projectConfig.title || 'EduFlow';
  const description = projectConfig.description || '';
  const targetAudience = projectConfig.target_audience || '';
  const author = projectConfig.author || '';
  // 생성 시 사용한 모델 ID (config.json.claude_model 또는 config.json.model)
  const modelId = projectConfig.claude_model || projectConfig.model || '';
  // 모델 친화적 표시 이름 (하드코딩 매핑 — 신규 모델은 필요 시 추가)
  const modelLabel = (() => {
    if (!modelId) return '';
    const map = {
      'claude-opus-4-7': 'Claude Opus 4.7',
      'claude-opus-4-6': 'Claude Opus 4.6',
      'claude-sonnet-4-6': 'Claude Sonnet 4.6',
      'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
    };
    return map[modelId] || modelId;
  })();

  const frontmatter = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description || title)}`,
    'template: doc',
    '---',
    '',
  ].join('\n');

  // 사이드바에 이미 목차가 있으므로 index는 간결하게:
  // 설명 + 대상 + 첫 챕터 바로가기 + 저자·생성 도구 표기
  const firstDoc = groups[0]?.items?.[0];
  const lines = [];
  if (description) lines.push(`> ${description}`, '');
  if (targetAudience) lines.push(`**대상 독자:** ${targetAudience}`, '');
  if (firstDoc) {
    // basePath를 명시적으로 prepend한 절대 경로.
    // 상대 경로는 "/eduflow-teacher-intro" (끝 슬래시 없이) 접근 시 깨짐 → 이 방식이 안전.
    const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
    lines.push(`[👉 첫 차시 시작하기: ${firstDoc.title}](${normalizedBase}${toPosixPath(firstDoc.slug)}/)`, '');
  }
  // 생성 도구 푸터 — <div> 안에선 Markdown이 파싱 안 되므로 HTML로 직접 작성
  const footerParts = [];
  if (author) footerParts.push(`📝 저자: <strong>${author}</strong>`);
  footerParts.push('생성 도구: <a href="https://eduflow-greatsong.fly.dev/">EduFlow</a>');
  if (modelLabel) footerParts.push(`모델: ${modelLabel}`);
  lines.push('');
  lines.push('<div class="ef-publish-footer">');
  lines.push(footerParts.join(' · '));
  lines.push('</div>');

  return frontmatter + lines.join('\n');
}

// ============================================================
// 이미지 복사
// ============================================================

async function copyProjectImages(buildDir, projectPath) {
  // v1 이미지 위치: projectPath/images 또는 projectPath/docs/images
  const candidates = [
    join(projectPath, 'images'),
    join(projectPath, 'docs', 'images'),
  ];
  const actualDir = candidates.find((d) => existsSync(d));
  if (!actualDir) return 0;

  const files = readdirSync(actualDir)
    .filter((f) => /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(f));
  if (files.length === 0) return 0;

  const destDir = join(buildDir, 'public', 'images');
  await mkdir(destDir, { recursive: true });
  for (const f of files) {
    await copyFile(join(actualDir, f), join(destDir, f));
  }
  return files.length;
}

// ============================================================
// 공개 API
// ============================================================

/**
 * Starlight 프로젝트 소스 트리를 생성한다.
 * 빌드 실행(npm install + astro build)은 deployment.js가 담당.
 *
 * @param {object} opts
 * @param {string} opts.projectPath - 프로젝트 루트 절대 경로
 * @param {string} [opts.siteName]  - 사이트 제목 (없으면 config.json의 title)
 * @param {string} [opts.creator]   - 제작자 표기
 * @param {string} [opts.accentColor='#A62018']
 * @returns {Promise<{buildDir: string, folderName: string, chapterCount: number, imageCount: number}>}
 */
export async function generateStarlightProject({
  projectPath,
  siteName,
  creator,
  colorTheme = DEFAULT_THEME_KEY,
  accentColor, // 하위 호환: hex 직접 지정 시 colorTheme 무시
  basePath = '/', // GitHub Pages 서브경로 배포 시 내부 링크(index.md)에 prefix로 박아 넣기 위함
}) {
  // colorTheme 파라미터(string key) 우선, 없으면 accentColor hex → 프리셋 매칭
  const theme = accentColor
    ? resolveColorTheme(accentColor)
    : resolveColorTheme(colorTheme);
  // 1. 입력 로드
  const configPath = join(projectPath, 'config.json');
  const tocPath = join(projectPath, 'toc.json');
  const docsDir = join(projectPath, 'docs');

  if (!existsSync(configPath)) {
    throw new Error(`[starlight] config.json 없음: ${configPath}`);
  }
  if (!existsSync(tocPath)) {
    throw new Error(`[starlight] toc.json 없음: ${tocPath}`);
  }
  if (!existsSync(docsDir)) {
    throw new Error(`[starlight] docs/ 폴더 없음: ${docsDir}`);
  }

  const projectConfig = JSON.parse(await readFile(configPath, 'utf-8'));
  const toc = JSON.parse(await readFile(tocPath, 'utf-8'));
  const title = siteName || projectConfig.title || 'EduFlow';
  if (creator && !projectConfig.author) projectConfig.author = creator;

  // 2. 챕터 메타 수집: toc.json 순서를 따름
  const chapterFiles = readdirSync(docsDir)
    .filter((f) => /^chapter\d+\.md$/i.test(f));
  const chapterFileSet = new Set(chapterFiles);

  const docs = [];
  const tocChapters = Array.isArray(toc.parts)
    ? toc.parts.flatMap((p) => (p.chapters || []))
    : [];

  for (const ref of tocChapters) {
    const chapterId = ref.chapter_id || ref.id;
    if (!chapterId) continue;
    const mdFile = `${chapterId}.md`;
    if (!chapterFileSet.has(mdFile)) continue;
    docs.push({
      chapterId,
      title: ref.chapter_title || ref.title || chapterId,
      slug: chapterId,
      filePath: join(docsDir, mdFile),
    });
  }

  // toc에 없는 챕터 파일도 포함 (안전장치)
  for (const f of chapterFiles) {
    const chapterId = f.replace(/\.md$/i, '');
    if (!docs.find((d) => d.chapterId === chapterId)) {
      docs.push({
        chapterId,
        title: chapterId,
        slug: chapterId,
        filePath: join(docsDir, f),
      });
    }
  }

  // 3. buildDir 초기화
  const folderName = safeName(projectConfig.name || projectConfig.title || 'eduflow', projectConfig.name);
  const buildDir = join(projectPath, '.starlight-build');
  await rm(buildDir, { recursive: true, force: true });
  await mkdir(buildDir, { recursive: true });
  await mkdir(join(buildDir, 'src', 'content', 'docs'), { recursive: true });
  await mkdir(join(buildDir, 'src', 'styles'), { recursive: true });
  await mkdir(join(buildDir, 'public'), { recursive: true });

  // 4. 정적 파일 작성
  await writeFile(join(buildDir, 'package.json'), buildPackageJson(folderName), 'utf-8');
  await writeFile(join(buildDir, 'tsconfig.json'), buildTsConfig(), 'utf-8');
  await writeFile(
    join(buildDir, 'src', 'content.config.ts'),
    buildContentConfig(),
    'utf-8',
  );
  await writeFile(
    join(buildDir, 'src', 'styles', 'custom.css'),
    buildCustomCss({ accentColor: theme.accent, accentBg: theme.accentBg }),
    'utf-8',
  );

  // public/mermaid-init.js (Mermaid 클라이언트 사이드 렌더러)
  await mkdir(join(buildDir, 'public'), { recursive: true });
  await writeFile(
    join(buildDir, 'public', 'mermaid-init.js'),
    buildMermaidInitScript(),
    'utf-8',
  );

  // public/toc-toggle.js (목차 접기 상태 localStorage 유지)
  await writeFile(
    join(buildDir, 'public', 'toc-toggle.js'),
    buildTocToggleScript(),
    'utf-8',
  );

  // public/favicon.svg (에듀플로 공식 파비콘 — emerald 책 + 체크)
  await writeFile(
    join(buildDir, 'public', 'favicon.svg'),
    buildFaviconSvg(),
    'utf-8',
  );

  // 5. 챕터 MDX 파일 생성
  const groups = buildPartGroupsFromToc(toc, docs);
  for (const doc of docs) {
    const raw = await readFile(doc.filePath, 'utf-8');
    // 처리 순서:
    //   H1 제거
    //   → 숫자 범위 틸드(15~19 → 15-19) 정규화: GFM strikethrough 오인식 방지
    //   → Mermaid 블록을 HTML로 변환 (Shiki 회피)
    //   → ASCII 박스 코드블록을 전용 HTML로 변환 (Expressive Code 회피)
    //   → 이미지 경로 정규화
    //   → admonition 변환
    //   → 볼드 안정화
    const processed = normalizeInlineBold(
      convertAdmonitions(
        rewriteLocalImageRefs(
          rewriteAsciiBoxBlocks(
            rewriteMermaidBlocks(
              normalizeNumericRanges(stripFirstH1(raw)),
            ),
          ),
          basePath,
        ),
      ),
    );
    const content =
      buildFrontmatter({
        title: doc.title,
      }) + processed;
    // .md 확장자 사용: MDX보다 관대함. <details>, <summary> 등 비공식 HTML 허용.
    // (MDX는 HTML 태그 짝 맞추기를 엄격히 검증 → 교재 콘텐츠 빌드 실패 유발)
    await writeFile(
      join(buildDir, 'src', 'content', 'docs', `${doc.slug}.md`),
      content,
      'utf-8',
    );
  }

  // 6. 인덱스 페이지 (index는 그대로 .md — MDX 컴포넌트 필요 시 .mdx로 변경)
  await writeFile(
    join(buildDir, 'src', 'content', 'docs', 'index.md'),
    buildIndexBody(projectConfig, groups, basePath),
    'utf-8',
  );

  // 6-1. 404 페이지 — Starlight 0.34가 자동 생성하지만 명시적으로 넣어두면 커스터마이즈 가능.
  //      editUrl/pagefind 등 부가 필드는 zod 파싱 이슈 회피를 위해 생략.
  const normalizedBaseFor404 = basePath.endsWith('/') ? basePath : `${basePath}/`;
  await writeFile(
    join(buildDir, 'src', 'content', 'docs', '404.md'),
    [
      '---',
      'title: "페이지를 찾을 수 없습니다"',
      'description: "404 — Not Found"',
      '---',
      '',
      '요청하신 페이지를 찾을 수 없습니다.',
      '',
      `[홈으로 돌아가기](${normalizedBaseFor404})`,
      '',
    ].join('\n'),
    'utf-8',
  );

  // 7. astro.config.mjs
  const sidebar = buildSidebarFromGroups(groups);
  await writeFile(
    join(buildDir, 'astro.config.mjs'),
    buildAstroConfig({ title, sidebar }),
    'utf-8',
  );

  // 8. 이미지 복사
  const imageCount = await copyProjectImages(buildDir, projectPath);

  return {
    buildDir,
    folderName,
    chapterCount: docs.length,
    imageCount,
  };
}
