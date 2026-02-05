import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import pLimit from 'p-limit';
import { TemplateManager } from './templateManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================
// TPM (Tokens Per Minute) 예산 관리자
// ============================================================
class TokenBudgetManager {
  constructor(tpmLimit = 40000) {
    this.tpmLimit = tpmLimit;
    this.tokensUsedThisMinute = 0;
    this.minuteStart = Date.now();
    this.requestHistory = []; // {timestamp, tokens} 배열
  }

  // 1분 윈도우 내의 사용량 계산
  _cleanupOldRequests() {
    const oneMinuteAgo = Date.now() - 60000;
    this.requestHistory = this.requestHistory.filter(r => r.timestamp > oneMinuteAgo);
    this.tokensUsedThisMinute = this.requestHistory.reduce((sum, r) => sum + r.tokens, 0);
  }

  // 예상 토큰만큼 예산이 있는지 확인하고, 없으면 대기
  async waitForBudget(estimatedTokens, progressCallback = null) {
    this._cleanupOldRequests();

    // 예산 초과 시 대기
    if (this.tokensUsedThisMinute + estimatedTokens > this.tpmLimit) {
      const oldestRequest = this.requestHistory[0];
      if (oldestRequest) {
        const waitTime = Math.max(0, 60000 - (Date.now() - oldestRequest.timestamp) + 1000);
        if (waitTime > 0 && progressCallback) {
          progressCallback(`⏳ TPM 예산 대기 중... (${Math.ceil(waitTime / 1000)}초)`);
        }
        await this._sleep(waitTime);
        return this.waitForBudget(estimatedTokens, progressCallback);
      }
    }
  }

  // 사용한 토큰 기록
  recordUsage(tokens) {
    this.requestHistory.push({ timestamp: Date.now(), tokens });
    this._cleanupOldRequests();
  }

  // 현재 사용량 조회
  getCurrentUsage() {
    this._cleanupOldRequests();
    return {
      used: this.tokensUsedThisMinute,
      limit: this.tpmLimit,
      remaining: Math.max(0, this.tpmLimit - this.tokensUsedThisMinute),
    };
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 템플릿별 기본 프롬프트 설정
const TEMPLATE_PROMPTS = {
  'programming-course': {
    role: '프로그래밍 교육자료를 만드는 전문가',
    audience: '프로그래밍 학습자',
    philosophy: '코드로 문제를 해결하는 능력을 기르자',
    style: '코드 예제 중심, 실습 위주',
    tone: '친근하고 격려하는 톤',
  },
  'school-textbook': {
    role: '학교 교과서 수준의 교육자료를 만드는 전문가',
    audience: '학생',
    philosophy: '체계적인 지식 습득과 이해',
    style: '교과서 형식, 학습 목표 명확',
    tone: '정확하고 체계적인 톤',
  },
  'business-education': {
    role: '비즈니스 실무 교육자료를 만드는 전문가',
    audience: '비즈니스 전문가 및 직장인',
    philosophy: '실무에 바로 적용 가능한 지식',
    style: '사례 중심, 실무 팁 위주',
    tone: '전문적이면서 실용적인 톤',
  },
  'workshop-material': {
    role: '워크숍 및 연수 자료를 만드는 전문가',
    audience: '워크숍 참가자',
    philosophy: '짧은 시간 내 핵심 역량 습득',
    style: '활동 중심, 참여형 학습',
    tone: '활기차고 참여를 유도하는 톤',
  },
  'self-directed-learning': {
    role: '자기주도 학습서를 만드는 전문가',
    audience: '독학하는 입문자',
    philosophy: '혼자서도 충분히 이해할 수 있도록',
    style: '친절한 설명, 단계별 안내',
    tone: '친근하고 격려하는 톤',
  },
  'teacher-guide-4c': {
    role: '4C 역량(창의·비판·소통·협업) 기반 교사용 지도서를 만드는 전문가',
    audience: '교사 및 교육 기획자',
    philosophy: '미래 역량 중심 교육 설계',
    style: '지도안 형식, 활동 설계 포함',
    tone: '전문적이고 체계적인 톤',
  },
};

const DEFAULT_PROMPT = {
  role: '독학용 교재 수준의 완성도 높은 교육자료를 만드는 전문가',
  audience: '학습자',
  philosophy: '혼자 읽어도 이해되는 완성도',
  style: '친근하고 체계적인 설명',
  tone: '친근하고 격려하는 톤',
};

export class ChapterGenerator {
  constructor(projectPath, apiKey = null) {
    this.projectPath = projectPath;
    this.docsPath = join(projectPath, 'docs');
    this.outlinesPath = join(projectPath, 'outlines');
    this.referencesPath = join(projectPath, 'references');
    this.logsPath = join(projectPath, 'logs');
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY;

    // 모델 가격 캐시 (BUG-001 수정: 한 번만 로드)
    this._modelPricing = null;

    this.projectConfig = {};
    this.templateInfo = {};
  }

  async init() {
    // 디렉토리 보장
    for (const dir of [this.docsPath, this.logsPath]) {
      if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    }

    this.logFile = join(this.logsPath, `generation_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.log`);
    this.projectConfig = await this._loadJson(join(this.projectPath, 'config.json'));
    this.templateInfo = await this._loadJson(join(this.projectPath, 'template-info.json'));
    this._modelPricing = await this._loadModelPricing();
  }

  async _loadJson(filePath) {
    if (!existsSync(filePath)) return {};
    try {
      return JSON.parse(await readFile(filePath, 'utf-8'));
    } catch {
      return {};
    }
  }

  async _loadModelPricing() {
    const configPath = join(__dirname, '..', '..', 'model_config.json');
    if (!existsSync(configPath)) {
      return {
        'claude-opus-4-5-20251101': { input: 15.0, output: 75.0 },
        'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
      };
    }
    try {
      const config = JSON.parse(await readFile(configPath, 'utf-8'));
      const pricing = {};
      for (const m of config.models || []) {
        pricing[m.id] = m.pricing || { input: 3.0, output: 15.0 };
      }
      return pricing;
    } catch {
      return { 'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 } };
    }
  }

  _getPromptConfig() {
    const templateId = this.templateInfo.template_id || '';
    const config = { ...(TEMPLATE_PROMPTS[templateId] || DEFAULT_PROMPT) };

    const custom = this.templateInfo.custom_prompt_config || {};
    for (const key of ['role', 'audience', 'philosophy', 'style', 'tone']) {
      if (custom[key]) config[key] = custom[key];
    }
    if (this.projectConfig.target_audience) {
      config.audience = this.projectConfig.target_audience;
    }
    return config;
  }

  _parseTimeMinutes(estimatedTime) {
    if (!estimatedTime) return 0;
    const match = estimatedTime.match(/(\d+)/);
    let minutes = match ? parseInt(match[1], 10) : 0;
    if (estimatedTime.includes('시간')) minutes *= 60;
    return minutes;
  }

  _calcMaxTokensForTime(timeMinutes, userMaxTokens) {
    if (timeMinutes <= 0) return userMaxTokens;
    const targetChars = timeMinutes * 100;
    const estimatedTokens = Math.floor(targetChars / 1.5);
    const timeCap = Math.max(4000, Math.floor(estimatedTokens * 1.4));
    return Math.min(userMaxTokens, timeCap);
  }

  _estimateCost(model, inputTokens, outputTokens) {
    const pricing = (this._modelPricing || {})[model] || { input: 3.0, output: 15.0 };
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return {
      input_cost: Math.round(inputCost * 10000) / 10000,
      output_cost: Math.round(outputCost * 10000) / 10000,
      total_cost: Math.round((inputCost + outputCost) * 10000) / 10000,
      pricing,
    };
  }

  _log(message) {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const entry = `[${ts}] ${message}\n`;
    if (this.logFile) {
      writeFile(this.logFile, entry, { flag: 'a' }).catch(() => {});
    }
  }

  _estimateTokens(text) {
    let korean = 0;
    for (const c of text) {
      if (c >= '\uac00' && c <= '\ud7a3') korean++;
    }
    const other = text.length - korean;
    return Math.floor((korean / 2 + other / 4) * 1.1);
  }

  async _loadOutline(chapterId) {
    const file = join(this.outlinesPath, `${chapterId}.md`);
    if (!existsSync(file)) return null;
    return readFile(file, 'utf-8');
  }

  async _loadReferences() {
    if (!existsSync(this.referencesPath)) return [];
    const files = await readdir(this.referencesPath);
    const refs = [];
    for (const file of files) {
      if (/\.(md|txt|markdown)$/.test(file)) {
        try {
          const content = await readFile(join(this.referencesPath, file), 'utf-8');
          refs.push(`[${file}]\n${content}`);
        } catch { /* skip */ }
      }
    }
    return refs;
  }

  _truncateReferences(references, maxChars) {
    const truncated = [];
    let total = 0;
    for (const ref of references) {
      if (total + ref.length <= maxChars) {
        truncated.push(ref);
        total += ref.length;
      } else {
        const remaining = maxChars - total;
        if (remaining > 500) {
          truncated.push(ref.slice(0, remaining) + '\n\n... (참고자료 축소됨)');
        }
        break;
      }
    }
    return truncated;
  }

  _sortReferencesByRelevance(references, chapterTitle, outline, partContext = '') {
    if (!references || references.length <= 1) return references;

    const searchTerms = new Set();
    for (const text of [chapterTitle, partContext, (outline || '').slice(0, 500)]) {
      const words = text.replace(/[,.:*\-_#\[\]"'()]/g, ' ').split(/\s+/);
      for (const word of words) {
        const clean = word.trim();
        if (clean.length >= 2) searchTerms.add(clean.toLowerCase());
      }
    }

    const scored = references.map((ref) => {
      const refLower = ref.slice(0, 3000).toLowerCase();
      let score = 0;
      for (const term of searchTerms) {
        if (refLower.includes(term)) score++;
      }
      return { score, ref };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.ref);
  }

  async _buildPrompt(chapterId, chapterTitle, outline, references, partContext, maxTokens, estimatedTime, totalChapters, currentNum) {
    const BASE_PROMPT_TOKENS = 2500;
    const MAX_CONTEXT_TOKENS = 150000;
    const availableInputTokens = MAX_CONTEXT_TOKENS - maxTokens - BASE_PROMPT_TOKENS;

    references = this._sortReferencesByRelevance(references, chapterTitle, outline, partContext);

    const outlineTokens = this._estimateTokens(outline || '');
    let refsTextFull = references.length ? references.join('\n\n---\n\n') : '';
    const refsTokens = this._estimateTokens(refsTextFull);
    const totalInputTokens = outlineTokens + refsTokens;

    let refsText;
    if (totalInputTokens > availableInputTokens) {
      const maxRefsChars = Math.floor((availableInputTokens - outlineTokens) * 3);
      if (maxRefsChars > 0) {
        const truncated = this._truncateReferences(references, maxRefsChars);
        refsText = truncated.length ? truncated.join('\n\n---\n\n') : '참고자료 없음';
        this._log(`⚠️ 토큰 초과로 참고자료 축소: ${refsTokens} → ${this._estimateTokens(refsText)} 토큰`);
      } else {
        refsText = '참고자료 없음 (토큰 한도 초과로 생략)';
      }
    } else {
      refsText = refsTextFull || '참고자료 없음';
    }

    const finalTokens = this._estimateTokens((outline || '') + refsText) + BASE_PROMPT_TOKENS;
    this._log(`📊 ${chapterId} 프롬프트 토큰 추정: 입력 ~${finalTokens}, 출력 예약 ${maxTokens}`);

    const tm = new TemplateManager();
    const templateAddition = await tm.getChapterPromptAddition(this.projectPath);

    const timeMinutes = this._parseTimeMinutes(estimatedTime);
    let timeConstraint = '';
    if (timeMinutes > 0) {
      let courseInfo = '';
      if (totalChapters > 0 && currentNum > 0) {
        courseInfo = `\n**전체 과정**: 총 ${totalChapters}차시 중 ${currentNum}차시\n- 각 차시는 ${estimatedTime} 분량입니다\n`;
      }
      const charMin = timeMinutes * 60;
      const charMax = timeMinutes * 100;
      const conceptCount = Math.max(1, Math.min(4, Math.floor(timeMinutes / 20)));
      const stepCount = Math.max(2, Math.min(6, Math.floor(timeMinutes / 10)));

      timeConstraint = `
# ⏱️ 학습 시간 제약 (최우선 준수사항!)
**이 챕터의 목표 학습 시간: ${estimatedTime}**
${courseInfo}

## 분량 가이드 (${estimatedTime} 기준)
- 전체 글자 수: 약 ${charMin.toLocaleString()}~${charMax.toLocaleString()}자 (이 범위를 반드시 지키세요!)
- 핵심 개념: ${conceptCount}개에 집중
- 따라하기 실습: ${stepCount}단계 이내
- 코드 예제: 핵심만 포함, 부가 설명 최소화

## 절대 금지
- ${charMax.toLocaleString()}자를 초과하는 분량 작성 절대 금지
- 하나의 차시에 너무 많은 개념을 담지 마세요
- 이것은 ${estimatedTime} 수업 **한 차시** 분량입니다 (전체 교재가 아님!)
`;
    }

    const pc = this._getPromptConfig();
    const isCompact = timeMinutes > 0 && timeMinutes <= 60;

    const docStructure = isCompact
      ? `# 문서 구조 (필수 - 경량 버전, ${estimatedTime} 차시용)

## 🎯 이 장에서 배우는 것
- [ ] ...할 수 있다 (2-3개 체크박스)

## 📚 핵심 개념
### 개념: [이름]
1. 비유로 시작: "~는 마치 ~와 같아요"
2. 정확한 정의
3. 예시로 확인

## 🔨 따라하기
### Step 1: [소제목]
**코드**:
\`\`\`python
[코드 - 핵심 주석만]
\`\`\`
**실행 결과**:
\`\`\`
[예상 출력]
\`\`\`

## 📝 전체 코드
\`\`\`python
[완성된 전체 코드]
\`\`\`

## ⚠️ 주의할 점 (1-2개)

## ✅ 점검하기
1. [핵심 질문 2-3개]
<details><summary>정답 확인</summary>[답변]</details>

## 🔗 다음 장 미리보기`
      : `# 문서 구조 (필수)

## 🎯 이 장에서 배우는 것
- [ ] ...할 수 있다 (3-5개 체크박스)

## 💡 왜 이걸 배우나요?

## 📚 핵심 개념
### 개념 1: [이름]
1. 비유로 시작
2. 정확한 정의
3. 예시로 확인

## 🔨 따라하기
### Step 1~3: [소제목]

## 📝 전체 코드

## ⚠️ 자주 하는 실수 (최소 3개)

## ✅ 스스로 점검하기

## 🚀 더 해보기

## 🔗 다음 장으로`;

    return `당신은 ${pc.role}입니다.

# 핵심 철학
"${pc.philosophy}"
- ${pc.style}

# 대상 독자
**${pc.audience}**

# 작성할 챕터 정보
**ID**: ${chapterId}
**제목**: ${chapterTitle}
${partContext}
${timeConstraint}

# 챕터 개요
${outline || '개요 없음'}

# 참고자료
${refsText}

${docStructure}

# 작성 원칙
- **대상**: ${pc.audience}
- **혼자 읽어도 이해 가능**: 선생님 없이도 학습 가능한 수준
- **실행 가능한 코드**: 모든 코드는 복사해서 바로 실행 가능
- **톤앤매너**: ${pc.tone}, 이모지 센스있게 활용
- **비유와 예시 충분**: 추상적 개념을 구체적으로
- **시각 자료**: Mermaid 다이어그램 사용 (ASCII art 절대 금지!)

# 마크다운 형식으로 전체 챕터를 작성해주세요.
위 구조를 **반드시 모두** 포함하되, 분량 가이드를 철저히 준수하세요.
${templateAddition}
`;
  }

  /**
   * 단일 챕터 생성 (rate limit 자동 재시도 포함)
   */
  async generateChapter(chapterId, chapterTitle, partContext = '', model = 'claude-opus-4-5-20251101', maxTokens = 16000, progressCallback = null, estimatedTime = '', totalChapters = 0, currentNum = 0, tokenBudget = null) {
    const timeMinutes = this._parseTimeMinutes(estimatedTime);
    const effectiveMaxTokens = this._calcMaxTokensForTime(timeMinutes, maxTokens);

    if (timeMinutes > 0 && effectiveMaxTokens < maxTokens) {
      this._log(`⏱️ ${chapterId} 시간 제약 적용: ${estimatedTime} → max_tokens ${maxTokens} → ${effectiveMaxTokens}`);
    }

    this._log(`📖 ${chapterId} (${chapterTitle}) 생성 시작 [max_tokens=${effectiveMaxTokens}]`);
    if (progressCallback) progressCallback(`📖 ${chapterId} 생성 시작... [max_tokens=${effectiveMaxTokens}]`);

    const outline = await this._loadOutline(chapterId);
    if (!outline) {
      const error = `개요 파일을 찾을 수 없습니다: ${chapterId}.md`;
      this._log(`❌ ${chapterId} 실패: ${error}`);
      return { success: false, chapter_id: chapterId, error };
    }

    const references = await this._loadReferences();
    const prompt = await this._buildPrompt(chapterId, chapterTitle, outline, references, partContext, effectiveMaxTokens, estimatedTime, totalChapters, currentNum);

    // 예상 토큰 계산 (입력 + 출력)
    const estimatedInputTokens = this._estimateTokens(prompt);
    const estimatedTotalTokens = estimatedInputTokens + effectiveMaxTokens;

    // TPM 예산 대기 (TokenBudgetManager가 있는 경우)
    if (tokenBudget) {
      await tokenBudget.waitForBudget(estimatedTotalTokens, progressCallback);
    }

    const MAX_RETRIES = 3;
    let lastError = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        if (progressCallback) progressCallback(`🤖 ${chapterId} Claude API 호출 중...${attempt > 0 ? ` (재시도 ${attempt}/${MAX_RETRIES - 1})` : ''}`);

        const client = new Anthropic({ apiKey: this.apiKey });
        const response = await client.messages.create({
          model,
          max_tokens: effectiveMaxTokens,
          messages: [{ role: 'user', content: prompt }],
        });

        const content = response.content[0].text;
        const chapterFile = join(this.docsPath, `${chapterId}.md`);
        await writeFile(chapterFile, content, 'utf-8');

        const inputTokens = response.usage.input_tokens;
        const outputTokens = response.usage.output_tokens;

        // TPM 예산에 실제 사용량 기록
        if (tokenBudget) {
          tokenBudget.recordUsage(inputTokens + outputTokens);
        }

        this._log(`✅ ${chapterId} 생성 완료 - 입력: ${inputTokens}, 출력: ${outputTokens}, 문자 수: ${content.length}`);
        if (progressCallback) progressCallback(`✅ ${chapterId} 생성 완료!`);

        return {
          success: true,
          chapter_id: chapterId,
          file_path: chapterFile,
          content,
          tokens_used: inputTokens + outputTokens,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        };
      } catch (e) {
        lastError = e;

        // Rate limit (429) 또는 overloaded (529) 에러 감지
        const isRateLimit = e.status === 429 || e.status === 529 ||
          (e.message && (e.message.includes('rate') || e.message.includes('overloaded')));

        if (isRateLimit && attempt < MAX_RETRIES - 1) {
          // 지수 백오프: 30초, 60초, 120초
          const waitTime = Math.pow(2, attempt) * 30000;
          this._log(`⏳ ${chapterId} Rate limit - ${waitTime / 1000}초 대기 후 재시도 (${attempt + 1}/${MAX_RETRIES})`);
          if (progressCallback) progressCallback(`⏳ Rate limit 감지 - ${waitTime / 1000}초 대기 후 재시도...`);
          await new Promise(r => setTimeout(r, waitTime));
          continue;
        }

        // 재시도 불가능한 에러거나 최대 재시도 초과
        break;
      }
    }

    this._log(`❌ ${chapterId} 생성 실패: ${lastError?.message || 'Unknown error'}`);
    if (progressCallback) progressCallback(`❌ ${chapterId} 생성 실패: ${lastError?.message || 'Unknown error'}`);
    return { success: false, chapter_id: chapterId, error: lastError?.message || 'Unknown error' };
  }

  /**
   * 전체 챕터 배치 생성
   * @param {Object} tocData - 목차 데이터
   * @param {string} model - Claude 모델 ID
   * @param {number} maxTokens - 최대 출력 토큰
   * @param {number} concurrent - 동시 실행 수
   * @param {Function} progressCallback - 진행 상황 콜백
   * @param {boolean} skipCompleted - 완료된 챕터 건너뛰기
   * @param {number} tpmLimit - 분당 토큰 제한 (0이면 비활성화)
   */
  async generateAllChapters(tocData, model = 'claude-opus-4-5-20251101', maxTokens = 16000, concurrent = 1, progressCallback = null, skipCompleted = true, tpmLimit = 0) {
    const startTime = Date.now();

    // TPM 예산 관리자 생성 (tpmLimit > 0인 경우에만)
    const tokenBudget = tpmLimit > 0 ? new TokenBudgetManager(tpmLimit) : null;

    this._log(`🚀 챕터 배치 생성 시작 - 모델: ${model}, 동시 실행: ${concurrent}, TPM 제한: ${tpmLimit || '없음'}`);
    if (progressCallback) {
      progressCallback('🚀 챕터 배치 생성 시작!');
      if (tpmLimit > 0) progressCallback(`📊 TPM 제한: ${tpmLimit.toLocaleString()} 토큰/분`);
    }

    const totalChaptersCount = (tocData.parts || []).reduce((sum, p) => sum + (p.chapters || []).length, 0);

    const tasks = [];
    let skippedCount = 0;
    let chapterCounter = 0;

    for (const part of tocData.parts || []) {
      const partInfo = `**Part ${part.part_number}**: ${part.part_title}`;

      for (const chapter of part.chapters || []) {
        chapterCounter++;
        const chapterId = chapter.chapter_id;

        if (skipCompleted && existsSync(join(this.docsPath, `${chapterId}.md`))) {
          if (progressCallback) progressCallback(`⏭️  ${chapterId} - 이미 완료됨 (건너뜀)`);
          skippedCount++;
          continue;
        }

        tasks.push({
          chapter_id: chapterId,
          chapter_title: chapter.chapter_title,
          part_context: partInfo,
          estimated_time: chapter.estimated_time || '',
          total_chapters: totalChaptersCount,
          current_chapter_num: chapterCounter,
        });
      }
    }

    const totalTasks = tasks.length;
    if (progressCallback) {
      const skipMsg = skippedCount > 0 ? ` (${skippedCount}개 건너뜀)` : '';
      progressCallback(`📊 총 ${totalTasks}개 챕터 생성 예정${skipMsg}`);
    }

    // p-limit으로 동시성 제어
    const limit = pLimit(concurrent);
    let completedCount = 0;

    const promises = tasks.map((task) =>
      limit(async () => {
        if (progressCallback) progressCallback(`\n[${completedCount + 1}/${totalTasks}] ${task.chapter_id}`);

        const result = await this.generateChapter(
          task.chapter_id,
          task.chapter_title,
          task.part_context,
          model,
          maxTokens,
          progressCallback,
          task.estimated_time,
          task.total_chapters,
          task.current_chapter_num,
          tokenBudget  // TPM 예산 관리자 전달
        );

        completedCount++;
        return result;
      })
    );

    const results = await Promise.allSettled(promises);
    const resolvedResults = results.map((r) => (r.status === 'fulfilled' ? r.value : { success: false, chapter_id: 'unknown', error: r.reason?.message || 'Unknown error' }));

    // 결과 집계
    const successCount = resolvedResults.filter((r) => r.success).length;
    const failedCount = totalTasks - successCount;
    const totalInputTokens = resolvedResults.filter((r) => r.success).reduce((sum, r) => sum + (r.input_tokens || 0), 0);
    const totalOutputTokens = resolvedResults.filter((r) => r.success).reduce((sum, r) => sum + (r.output_tokens || 0), 0);
    const totalTokens = totalInputTokens + totalOutputTokens;
    const estimatedCost = this._estimateCost(model, totalInputTokens, totalOutputTokens);

    const errors = resolvedResults.filter((r) => !r.success).map((r) => ({ chapter_id: r.chapter_id, error: r.error }));
    const elapsedTime = (Date.now() - startTime) / 1000;

    this._log(`🎉 배치 생성 완료 - 성공: ${successCount}, 실패: ${failedCount}, 건너뜀: ${skippedCount}`);
    this._log(`⏱️  총 소요 시간: ${elapsedTime.toFixed(1)}초, 총 토큰: ${totalTokens.toLocaleString()}`);
    this._log(`💰 추정 비용: $${estimatedCost.total_cost.toFixed(4)}`);

    if (progressCallback) {
      progressCallback(`\n🎉 생성 완료!`);
      progressCallback(`✅ 성공: ${successCount}/${totalTasks}`);
      if (failedCount > 0) progressCallback(`❌ 실패: ${failedCount}`);
      if (skippedCount > 0) progressCallback(`⏭️  건너뜀: ${skippedCount}`);
      progressCallback(`⏱️  소요 시간: ${elapsedTime.toFixed(1)}초`);
      progressCallback(`🪙 총 토큰: ${totalTokens.toLocaleString()} (입력: ${totalInputTokens.toLocaleString()} / 출력: ${totalOutputTokens.toLocaleString()})`);
      progressCallback(`💰 추정 비용: ~$${estimatedCost.total_cost.toFixed(4)}`);
    }

    // 리포트 저장
    const report = {
      success: successCount,
      failed: failedCount,
      skipped: skippedCount,
      total: totalTasks + skippedCount,
      chapters: resolvedResults,
      errors,
      total_tokens: totalTokens,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      estimated_cost: estimatedCost,
      elapsed_time: elapsedTime,
      generated_at: new Date().toISOString(),
      model,
    };

    await writeFile(join(this.projectPath, 'generation_report.json'), JSON.stringify(report, null, 2), 'utf-8');

    return report;
  }

  /**
   * toc.json에서 챕터 정보 조회
   */
  async findChapterInToc(chapterId) {
    const tocFile = join(this.projectPath, 'toc.json');
    if (!existsSync(tocFile)) return {};
    try {
      const tocData = JSON.parse(await readFile(tocFile, 'utf-8'));
      const totalChapters = (tocData.parts || []).reduce((sum, p) => sum + (p.chapters || []).length, 0);
      let counter = 0;
      for (const part of tocData.parts || []) {
        for (const ch of part.chapters || []) {
          counter++;
          if (ch.chapter_id === chapterId) {
            return {
              chapter_title: ch.chapter_title,
              estimated_time: ch.estimated_time || '',
              part_context: `**Part ${part.part_number}**: ${part.part_title}`,
              total_chapters: totalChapters,
              current_chapter_num: counter,
            };
          }
        }
      }
    } catch { /* empty */ }
    return {};
  }

  /**
   * 챕터 목록 + 상태 조회
   */
  async listChapters() {
    const tocFile = join(this.projectPath, 'toc.json');
    if (!existsSync(tocFile)) return [];

    const tocData = JSON.parse(await readFile(tocFile, 'utf-8'));
    const chapters = [];

    for (const part of tocData.parts || []) {
      for (const ch of part.chapters || []) {
        const docFile = join(this.docsPath, `${ch.chapter_id}.md`);
        chapters.push({
          ...ch,
          part_number: part.part_number,
          part_title: part.part_title,
          has_content: existsSync(docFile),
        });
      }
    }
    return chapters;
  }

  /**
   * 챕터 내용 읽기
   */
  async readChapter(chapterId) {
    const file = join(this.docsPath, `${chapterId}.md`);
    if (!existsSync(file)) return null;
    return readFile(file, 'utf-8');
  }

  /**
   * 챕터 내용 저장
   */
  async saveChapter(chapterId, content) {
    if (!existsSync(this.docsPath)) await mkdir(this.docsPath, { recursive: true });
    await writeFile(join(this.docsPath, `${chapterId}.md`), content, 'utf-8');
  }

  /**
   * 생성 리포트 로드
   */
  async loadReport() {
    const file = join(this.projectPath, 'generation_report.json');
    if (!existsSync(file)) return null;
    return JSON.parse(await readFile(file, 'utf-8'));
  }
}
