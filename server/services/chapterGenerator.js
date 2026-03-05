import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';
import { TemplateManager } from './templateManager.js';
import { streamChat, detectProvider, resolveApiKey } from './aiProvider.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================
// TPM (Tokens Per Minute) 예산 관리자 — 출력 TPM 기준 (Tier 4 최적화)
// Tier 4: 출력 400K (Opus/Sonnet), 800K (Haiku 4.5) / 입력 2M+
// 병목은 항상 출력 TPM이므로, 출력 토큰만 추적하여 불필요한 대기 제거
//
// 핵심: "예약(reserve)" 메커니즘으로 인플라이트 토큰을 추적하여
// 동시 실행 시 여러 요청이 같은 예산을 중복 사용하는 것을 방지
// ============================================================
class TokenBudgetManager {
  constructor(outputTpmLimit = 200000) {
    this.outputTpmLimit = outputTpmLimit;
    this.outputTokensUsedThisMinute = 0;
    this.reservedTokens = 0; // API 호출 중인 예약 토큰
    this.requestHistory = []; // {timestamp, outputTokens} 배열
  }

  // 1분 슬라이딩 윈도우 내의 출력 사용량 계산
  _cleanupOldRequests() {
    const oneMinuteAgo = Date.now() - 60000;
    this.requestHistory = this.requestHistory.filter(r => r.timestamp > oneMinuteAgo);
    this.outputTokensUsedThisMinute = this.requestHistory.reduce((sum, r) => sum + r.outputTokens, 0);
  }

  // 총 사용량 = 완료된 기록 + 인플라이트 예약
  _totalUsage() {
    return this.outputTokensUsedThisMinute + this.reservedTokens;
  }

  // 예상 출력 토큰만큼 예산이 있는지 확인하고, 없으면 대기 → 통과 시 예약
  async waitForBudget(estimatedOutputTokens, progressCallback = null) {
    this._cleanupOldRequests();

    if (this._totalUsage() + estimatedOutputTokens > this.outputTpmLimit) {
      // 가장 오래된 완료 기록 기준으로 대기 시간 계산
      const oldestRequest = this.requestHistory[0];
      if (oldestRequest) {
        const waitTime = Math.max(0, 60000 - (Date.now() - oldestRequest.timestamp) + 1000);
        if (waitTime > 0 && progressCallback) {
          const usage = this._totalUsage().toLocaleString();
          const limit = this.outputTpmLimit.toLocaleString();
          progressCallback(`⏳ 출력 TPM 예산 대기 중... ${usage}/${limit} (${Math.ceil(waitTime / 1000)}초)`);
        }
        await this._sleep(waitTime);
        return this.waitForBudget(estimatedOutputTokens, progressCallback);
      }
      // 기록은 없지만 예약만 있는 경우 — 짧게 대기 후 재확인
      if (this.reservedTokens > 0) {
        if (progressCallback) {
          progressCallback(`⏳ 인플라이트 요청 완료 대기 중... (예약: ${this.reservedTokens.toLocaleString()})`);
        }
        await this._sleep(5000);
        return this.waitForBudget(estimatedOutputTokens, progressCallback);
      }
    }

    // 예산 통과 → 즉시 예약하여 다른 동시 요청이 같은 예산을 쓰지 못하게 함
    this.reservedTokens += estimatedOutputTokens;
  }

  // API 완료 후: 예약 해제 + 실제 사용량 기록
  recordUsage(outputTokens, reservedAmount) {
    this.reservedTokens = Math.max(0, this.reservedTokens - reservedAmount);
    this.requestHistory.push({ timestamp: Date.now(), outputTokens });
    this._cleanupOldRequests();
  }

  // 예약만 해제 (실패 시 — 실제 사용 없음)
  releaseReservation(reservedAmount) {
    this.reservedTokens = Math.max(0, this.reservedTokens - reservedAmount);
  }

  // 현재 사용량 조회
  getCurrentUsage() {
    this._cleanupOldRequests();
    return {
      used: this.outputTokensUsedThisMinute,
      reserved: this.reservedTokens,
      limit: this.outputTpmLimit,
      remaining: Math.max(0, this.outputTpmLimit - this._totalUsage()),
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
  constructor(projectPath, apiKeys = null) {
    this.projectPath = projectPath;
    this.docsPath = join(projectPath, 'docs');
    this.outlinesPath = join(projectPath, 'outlines');
    this.referencesPath = join(projectPath, 'references');
    this.logsPath = join(projectPath, 'logs');
    // 하위 호환: 문자열이면 anthropic 키로 취급
    if (typeof apiKeys === 'string') {
      this.apiKeys = { anthropic: apiKeys, _default: apiKeys };
    } else {
      this.apiKeys = apiKeys || {};
    }

    // 모델 가격 캐시 (BUG-001 수정: 한 번만 로드)
    this._modelPricing = null;

    this.projectConfig = {};
    this.templateInfo = {};

    // 생성 상태 추적 (새로고침 대응)
    this._statusFile = join(projectPath, 'generation_status.json');
    this._statusLogs = [];
    this._statusWriteTimer = null;
    this._lastStatusWrite = 0;
    this._pendingStatusData = null;
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
    const fallback = {
      'claude-opus-4-6': { input: 5.0, output: 25.0 },
      'claude-opus-4-5-20251101': { input: 5.0, output: 25.0 },
      'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
      'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0 },
      'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
      'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
    };
    if (!existsSync(configPath)) {
      return fallback;
    }
    try {
      const config = JSON.parse(await readFile(configPath, 'utf-8'));
      const pricing = {};
      for (const m of config.models || []) {
        pricing[m.id] = m.pricing || { input: 3.0, output: 15.0 };
      }
      return pricing;
    } catch {
      return fallback;
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

    // "차시" 단위 처리: "1차시" = 50분, "2차시" = 100분
    const chashiMatch = estimatedTime.match(/(\d+)\s*차시/);
    if (chashiMatch) {
      return parseInt(chashiMatch[1], 10) * 50;
    }

    // "시간" 단위 처리: "1시간" = 60분, "2시간" = 120분
    const hourMatch = estimatedTime.match(/(\d+)\s*시간/);
    if (hourMatch) {
      return parseInt(hourMatch[1], 10) * 60;
    }

    // "분" 단위 처리: "50분" = 50
    const minMatch = estimatedTime.match(/(\d+)\s*분/);
    if (minMatch) {
      return parseInt(minMatch[1], 10);
    }

    // 숫자만 있는 경우: 분으로 간주
    const numMatch = estimatedTime.match(/(\d+)/);
    if (numMatch) {
      return parseInt(numMatch[1], 10);
    }

    // "교사 자율 학습" 등 숫자 없는 경우: 기본 30분
    this._log(`⚠️ estimated_time 파싱 불가 ("${estimatedTime}") → 기본 30분 적용`);
    return 30;
  }

  _calcMaxTokensForTime(timeMinutes, userMaxTokens) {
    // estimated_time이 없으면 기본 1차시(50분) 적용하여 과도한 생성 방지
    const effectiveMinutes = timeMinutes > 0 ? timeMinutes : 50;
    const targetChars = effectiveMinutes * 120;
    const estimatedTokens = Math.floor(targetChars / 1.5);
    const timeCap = Math.max(6000, Math.floor(estimatedTokens * 2.0));
    return Math.min(userMaxTokens, timeCap);
  }

  // ============================================================
  // 생성 상태 추적 메서드 (새로고침 대응)
  // ============================================================

  _addStatusLog(message) {
    this._statusLogs.push(message);
    if (this._statusLogs.length > 100) {
      this._statusLogs = this._statusLogs.slice(-100);
    }
  }

  async _writeGenerationStatus(data) {
    const statusData = {
      ...data,
      logs: this._statusLogs,
      updated_at: new Date().toISOString(),
    };
    await writeFile(this._statusFile, JSON.stringify(statusData, null, 2), 'utf-8');
  }

  async _writeGenerationStatusDebounced(data) {
    this._pendingStatusData = data;
    const now = Date.now();
    if (now - this._lastStatusWrite < 2000) {
      if (!this._statusWriteTimer) {
        this._statusWriteTimer = setTimeout(async () => {
          this._statusWriteTimer = null;
          this._lastStatusWrite = Date.now();
          await this._writeGenerationStatus(this._pendingStatusData).catch(() => {});
        }, 2000 - (now - this._lastStatusWrite));
      }
      return;
    }
    this._lastStatusWrite = now;
    await this._writeGenerationStatus(data).catch(() => {});
  }

  async loadGenerationStatus() {
    if (!existsSync(this._statusFile)) return null;
    try {
      return JSON.parse(await readFile(this._statusFile, 'utf-8'));
    } catch {
      return null;
    }
  }

  async _isCancelRequested() {
    const status = await this.loadGenerationStatus();
    return status?.cancel_requested === true;
  }

  async requestCancel() {
    const status = await this.loadGenerationStatus();
    if (status && status.status === 'running') {
      status.cancel_requested = true;
      await writeFile(this._statusFile, JSON.stringify(status, null, 2), 'utf-8');
      return true;
    }
    return false;
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

  /**
   * 스트리밍 방식 AI API 호출 (실시간 진행률 표시, 멀티 프로바이더)
   */
  async _streamGenerate(model, maxTokens, prompt, chapterId, progressCallback, isRetry = false) {
    const provider = detectProvider(model);
    const apiKey = resolveApiKey(provider, this.apiKeys);
    const estimatedTotalChars = Math.round(maxTokens * 1.5);
    const prefix = isRetry ? '재시도 ' : '';
    let charsSoFar = 0;
    let lastProgressTime = Date.now();

    const result = await streamChat({
      provider, apiKey, model,
      messages: [{ role: 'user', content: prompt }],
      maxTokens,
      onText: (text) => {
        charsSoFar += text.length;
        const now = Date.now();
        if (now - lastProgressTime >= 3000 && progressCallback) {
          const pct = Math.min(99, Math.round((charsSoFar / estimatedTotalChars) * 100));
          progressCallback(`📝 ${chapterId} ${prefix}생성 중... ${charsSoFar.toLocaleString()}자 (~${pct}%)`);
          lastProgressTime = now;
        }
      },
    });

    if (result.stopReason === 'max_tokens') {
      this._log(`⚠️ ${chapterId} 응답이 max_tokens(${maxTokens})로 잘림 — 마지막 200자: ...${result.content.slice(-200)}`);
      if (progressCallback) progressCallback(`⚠️ ${chapterId} 토큰 한도 도달 — 내용이 잘렸을 수 있습니다. max_tokens를 늘려보세요.`);
    }

    return {
      content: result.content,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      stopReason: result.stopReason,
    };
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
    // estimated_time이 없으면 기본 1차시(50분) 기준으로 분량 가이드 생성
    const effectiveMinutes = timeMinutes > 0 ? timeMinutes : 50;
    const effectiveTimeLabel = estimatedTime || '50분 (기본)';
    let timeConstraint = '';
    {
      let courseInfo = '';
      if (totalChapters > 0 && currentNum > 0) {
        courseInfo = `\n**전체 과정**: 총 ${totalChapters}차시 중 ${currentNum}차시\n- 각 차시는 ${effectiveTimeLabel} 분량입니다\n`;
      }
      const charMin = effectiveMinutes * 60;
      const charMax = effectiveMinutes * 100;
      const conceptCount = Math.max(1, Math.min(4, Math.floor(effectiveMinutes / 20)));
      const stepCount = Math.max(2, Math.min(6, Math.floor(effectiveMinutes / 10)));

      timeConstraint = `
# ⏱️ 학습 시간 제약 (최우선 준수사항!)
**이 챕터의 목표 학습 시간: ${effectiveTimeLabel}**
${courseInfo}

## 분량 가이드 (${effectiveTimeLabel} 기준)
- 전체 글자 수: 약 ${charMin.toLocaleString()}~${charMax.toLocaleString()}자 (이 범위를 반드시 지키세요!)
- 핵심 개념: ${conceptCount}개에 집중
- 따라하기 실습: ${stepCount}단계 이내
- 코드 예제: 핵심만 포함, 부가 설명 최소화

## 절대 금지
- ${charMax.toLocaleString()}자를 초과하는 분량 작성 절대 금지
- 하나의 차시에 너무 많은 개념을 담지 마세요
- 이것은 ${effectiveTimeLabel} 수업 **한 차시** 분량입니다 (전체 교재가 아님!)
`;
    }

    const pc = this._getPromptConfig();
    const isCompact = effectiveMinutes <= 60;

    const docStructure = isCompact
      ? `# 문서 구조 (필수 - 경량 버전, ${effectiveTimeLabel} 차시용)

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
- **시각 자료**: 다이어그램은 반드시 Mermaid 코드블록 사용
- **마크다운 테이블 금지**: 파이프(|)와 대시(-)로 만드는 표(마크다운 테이블) 절대 사용 금지! 정보 요약은 볼드+목록, 개념 비교는 Mermaid로 표현
- **ASCII art 절대 금지**: 텍스트 문자로 그림/도표/박스를 그리지 마세요

# 마크다운 형식으로 전체 챕터를 작성해주세요.
위 구조를 **반드시 모두** 포함하되, 분량 가이드를 철저히 준수하세요.
${templateAddition}
`;
  }

  /**
   * 단일 챕터 생성 (rate limit 자동 재시도 포함)
   */
  async generateChapter(chapterId, chapterTitle, partContext = '', model = 'claude-opus-4-6', maxTokens = 8000, progressCallback = null, estimatedTime = '', totalChapters = 0, currentNum = 0, tokenBudget = null) {
    const timeMinutes = this._parseTimeMinutes(estimatedTime);
    const effectiveMaxTokens = this._calcMaxTokensForTime(timeMinutes, maxTokens);

    if (effectiveMaxTokens < maxTokens) {
      const source = timeMinutes > 0 ? estimatedTime : '기본 1차시(50분)';
      this._log(`⏱️ ${chapterId} 시간 제약 적용: ${source} → max_tokens ${maxTokens} → ${effectiveMaxTokens}`);
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

    // TPM 예산 대기 — 출력 토큰 기준 (병목), 통과 시 자동 예약됨
    const reserved = tokenBudget ? effectiveMaxTokens : 0;
    if (tokenBudget) {
      await tokenBudget.waitForBudget(effectiveMaxTokens, progressCallback);
    }

    try {
      if (progressCallback) progressCallback(`🤖 ${chapterId} Claude API 호출 중...`);

      const result = await this._streamGenerate(model, effectiveMaxTokens, prompt, chapterId, progressCallback);
      const chapterFile = join(this.docsPath, `${chapterId}.md`);
      await writeFile(chapterFile, result.content, 'utf-8');

      if (tokenBudget) {
        tokenBudget.recordUsage(result.outputTokens, reserved);
      }

      this._log(`✅ ${chapterId} 생성 완료 - 입력: ${result.inputTokens}, 출력: ${result.outputTokens}, 문자 수: ${result.content.length}`);
      if (progressCallback) progressCallback(`✅ ${chapterId} 완료! (${result.content.length.toLocaleString()}자, 토큰: ${(result.inputTokens + result.outputTokens).toLocaleString()})`);

      return {
        success: true,
        chapter_id: chapterId,
        file_path: chapterFile,
        content: result.content,
        tokens_used: result.inputTokens + result.outputTokens,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
      };
    } catch (e) {
      // 429 Rate limit — Retry-After 헤더 활용, 최대 2회 재시도
      if (e.status === 429) {
        const maxRetries = 2;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          const retryAfter = e.headers?.['retry-after'];
          const waitSec = retryAfter ? Math.min(parseInt(retryAfter, 10) || 30, 120) : (attempt === 1 ? 30 : 60);
          this._log(`⏳ ${chapterId} Rate limit (429) - ${waitSec}초 대기 후 재시도 ${attempt}/${maxRetries}`);
          if (progressCallback) progressCallback(`⏳ Rate limit 감지 - ${waitSec}초 대기 후 재시도 (${attempt}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, waitSec * 1000));

          try {
            const retryResult = await this._streamGenerate(model, effectiveMaxTokens, prompt, chapterId, progressCallback, true);
            const chapterFile = join(this.docsPath, `${chapterId}.md`);
            await writeFile(chapterFile, retryResult.content, 'utf-8');

            if (tokenBudget) {
              tokenBudget.recordUsage(retryResult.outputTokens, reserved);
            }

            this._log(`✅ ${chapterId} 재시도 ${attempt} 성공 - 입력: ${retryResult.inputTokens}, 출력: ${retryResult.outputTokens}`);
            if (progressCallback) progressCallback(`✅ ${chapterId} 재시도 완료! (${retryResult.content.length.toLocaleString()}자)`);

            return {
              success: true,
              chapter_id: chapterId,
              file_path: chapterFile,
              content: retryResult.content,
              tokens_used: retryResult.inputTokens + retryResult.outputTokens,
              input_tokens: retryResult.inputTokens,
              output_tokens: retryResult.outputTokens,
              retried: true,
            };
          } catch (retryErr) {
            if (retryErr.status !== 429 || attempt === maxRetries) {
              this._log(`❌ ${chapterId} 재시도 ${attempt} 실패: ${retryErr.message}`);
              if (progressCallback) progressCallback(`❌ ${chapterId} 재시도 실패: ${retryErr.message}`);
              if (tokenBudget) tokenBudget.releaseReservation(reserved);
              return { success: false, chapter_id: chapterId, error: retryErr.message };
            }
            e = retryErr; // 다음 루프에서 Retry-After 헤더 다시 확인
          }
        }
      }

      // 529 Overloaded — 잠시 대기 후 1회 재시도
      if (e.status === 529) {
        this._log(`⏳ ${chapterId} API Overloaded (529) - 30초 대기 후 1회 재시도`);
        if (progressCallback) progressCallback(`⏳ API 과부하 감지 - 30초 대기 후 재시도...`);
        await new Promise(r => setTimeout(r, 30000));

        try {
          const retryResult = await this._streamGenerate(model, effectiveMaxTokens, prompt, chapterId, progressCallback, true);
          const chapterFile = join(this.docsPath, `${chapterId}.md`);
          await writeFile(chapterFile, retryResult.content, 'utf-8');

          if (tokenBudget) {
            tokenBudget.recordUsage(retryResult.outputTokens, reserved);
          }

          this._log(`✅ ${chapterId} 529 재시도 성공`);
          if (progressCallback) progressCallback(`✅ ${chapterId} 재시도 완료! (${retryResult.content.length.toLocaleString()}자)`);

          return {
            success: true,
            chapter_id: chapterId,
            file_path: chapterFile,
            content: retryResult.content,
            tokens_used: retryResult.inputTokens + retryResult.outputTokens,
            input_tokens: retryResult.inputTokens,
            output_tokens: retryResult.outputTokens,
            retried: true,
          };
        } catch (e2) {
          this._log(`❌ ${chapterId} 529 재시도 실패: ${e2.message}`);
          if (progressCallback) progressCallback(`❌ ${chapterId} 재시도 실패: ${e2.message}`);
          if (tokenBudget) tokenBudget.releaseReservation(reserved);
          return { success: false, chapter_id: chapterId, error: e2.message };
        }
      }

      // 그 외 에러는 재시도하지 않음 — 예약 해제
      if (tokenBudget) tokenBudget.releaseReservation(reserved);
      this._log(`❌ ${chapterId} 생성 실패 (재시도 안 함): ${e.message}`);
      if (progressCallback) progressCallback(`❌ ${chapterId} 생성 실패: ${e.message}`);
      return { success: false, chapter_id: chapterId, error: e.message };
    }
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
  async generateAllChapters(tocData, model = 'claude-opus-4-6', maxTokens = 8000, concurrent = 1, progressCallback = null, skipCompleted = true, tpmLimit = 0, chapterIds = null) {
    const startTime = Date.now();

    // 출력 TPM 예산 관리자 생성 (tpmLimit > 0인 경우에만)
    const tokenBudget = tpmLimit > 0 ? new TokenBudgetManager(tpmLimit) : null;

    // 상태 추적 초기화
    this._statusLogs = [];
    const statusBase = {
      status: 'running',
      started_at: new Date().toISOString(),
      model,
      concurrent,
      total_tasks: 0,
      completed_tasks: 0,
      skipped: 0,
      failed_tasks: 0,
      current_chapter: null,
      current_chapter_title: null,
      current_chapters: [],
      cancel_requested: false,
      report: null,
    };

    // progressCallback을 래핑하여 로그를 status 파일에도 기록
    const wrappedProgress = (message) => {
      this._addStatusLog(message);
      this._writeGenerationStatusDebounced({ ...statusBase }).catch(() => {});
      progressCallback?.(message);
    };

    this._log(`🚀 챕터 배치 생성 시작 - 모델: ${model}, 동시 실행: ${concurrent}, 출력 TPM 제한: ${tpmLimit || '없음'}`);
    wrappedProgress('🚀 챕터 배치 생성 시작!');
    if (tpmLimit > 0) wrappedProgress(`📊 출력 TPM 제한: ${tpmLimit.toLocaleString()} 토큰/분`);

    const totalChaptersCount = (tocData.parts || []).reduce((sum, p) => sum + (p.chapters || []).length, 0);

    const tasks = [];
    let skippedCount = 0;
    let chapterCounter = 0;

    for (const part of tocData.parts || []) {
      const partInfo = `**Part ${part.part_number}**: ${part.part_title}`;

      for (const chapter of part.chapters || []) {
        chapterCounter++;
        const chapterId = chapter.chapter_id;

        // chapterIds 필터: 지정된 챕터만 생성
        if (chapterIds && !chapterIds.includes(chapterId)) {
          skippedCount++;
          continue;
        }

        if (skipCompleted && existsSync(join(this.docsPath, `${chapterId}.md`))) {
          wrappedProgress(`⏭️  ${chapterId} - 이미 완료됨 (건너뜀)`);
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
    statusBase.total_tasks = totalTasks;
    statusBase.skipped = skippedCount;
    await this._writeGenerationStatus(statusBase);

    const skipMsg = skippedCount > 0 ? ` (${skippedCount}개 건너뜀)` : '';
    wrappedProgress(`📊 총 ${totalTasks}개 챕터 생성 예정${skipMsg}`);

    // p-limit으로 동시성 제어
    const limit = pLimit(concurrent);
    let completedCount = 0;
    let cancelledCount = 0;

    const promises = tasks.map((task) =>
      limit(async () => {
        // 취소 확인
        if (await this._isCancelRequested()) {
          cancelledCount++;
          wrappedProgress(`🛑 ${task.chapter_id} - 취소됨 (건너뜀)`);
          return { success: false, chapter_id: task.chapter_id, error: '사용자 취소', cancelled: true };
        }

        statusBase.current_chapter = task.chapter_id;
        statusBase.current_chapter_title = task.chapter_title;
        statusBase.current_chapters = [...new Set([...(statusBase.current_chapters || []), task.chapter_id])];
        await this._writeGenerationStatusDebounced({ ...statusBase }).catch(() => {});

        wrappedProgress(`\n[${completedCount + 1}/${totalTasks}] ${task.chapter_id}`);

        const result = await this.generateChapter(
          task.chapter_id,
          task.chapter_title,
          task.part_context,
          model,
          maxTokens,
          wrappedProgress,
          task.estimated_time,
          task.total_chapters,
          task.current_chapter_num,
          tokenBudget
        );

        completedCount++;
        if (result.success) {
          statusBase.completed_tasks++;
        } else {
          statusBase.failed_tasks++;
        }
        statusBase.current_chapters = (statusBase.current_chapters || []).filter(id => id !== task.chapter_id);
        await this._writeGenerationStatusDebounced({ ...statusBase }).catch(() => {});

        return result;
      })
    );

    const results = await Promise.allSettled(promises);
    const resolvedResults = results.map((r) => (r.status === 'fulfilled' ? r.value : { success: false, chapter_id: 'unknown', error: r.reason?.message || 'Unknown error' }));

    // 결과 집계 (취소된 것은 실패에서 제외)
    const successCount = resolvedResults.filter((r) => r.success).length;
    const actualFailed = resolvedResults.filter((r) => !r.success && !r.cancelled).length;
    const totalInputTokens = resolvedResults.filter((r) => r.success).reduce((sum, r) => sum + (r.input_tokens || 0), 0);
    const totalOutputTokens = resolvedResults.filter((r) => r.success).reduce((sum, r) => sum + (r.output_tokens || 0), 0);
    const totalTokens = totalInputTokens + totalOutputTokens;
    const estimatedCost = this._estimateCost(model, totalInputTokens, totalOutputTokens);

    const errors = resolvedResults.filter((r) => !r.success && !r.cancelled).map((r) => ({ chapter_id: r.chapter_id, error: r.error }));
    const elapsedTime = (Date.now() - startTime) / 1000;

    const wasCancelled = cancelledCount > 0;
    const statusLabel = wasCancelled ? '중단됨' : '완료';

    this._log(`🎉 배치 생성 ${statusLabel} - 성공: ${successCount}, 실패: ${actualFailed}, 건너뜀: ${skippedCount}, 취소: ${cancelledCount}`);
    this._log(`⏱️  총 소요 시간: ${elapsedTime.toFixed(1)}초, 총 토큰: ${totalTokens.toLocaleString()}`);
    this._log(`💰 추정 비용: $${estimatedCost.total_cost.toFixed(4)}`);

    wrappedProgress(`\n${wasCancelled ? '🛑' : '🎉'} 생성 ${statusLabel}!`);
    wrappedProgress(`✅ 성공: ${successCount}/${totalTasks}`);
    if (actualFailed > 0) wrappedProgress(`❌ 실패: ${actualFailed}`);
    if (skippedCount > 0) wrappedProgress(`⏭️  건너뜀: ${skippedCount}`);
    if (cancelledCount > 0) wrappedProgress(`🛑 취소: ${cancelledCount}`);
    wrappedProgress(`⏱️  소요 시간: ${elapsedTime.toFixed(1)}초`);
    wrappedProgress(`🪙 총 토큰: ${totalTokens.toLocaleString()} (입력: ${totalInputTokens.toLocaleString()} / 출력: ${totalOutputTokens.toLocaleString()})`);
    wrappedProgress(`💰 추정 비용: ~$${estimatedCost.total_cost.toFixed(4)}`);

    // 리포트 저장
    const report = {
      success: successCount,
      failed: actualFailed,
      cancelled: cancelledCount,
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
      was_cancelled: wasCancelled,
    };

    await writeFile(join(this.projectPath, 'generation_report.json'), JSON.stringify(report, null, 2), 'utf-8');

    // 최종 상태 파일 갱신
    statusBase.status = wasCancelled ? 'cancelled' : (actualFailed === totalTasks ? 'failed' : 'completed');
    statusBase.current_chapter = null;
    statusBase.current_chapter_title = null;
    statusBase.current_chapters = [];
    statusBase.report = report;
    if (this._statusWriteTimer) {
      clearTimeout(this._statusWriteTimer);
      this._statusWriteTimer = null;
    }
    await this._writeGenerationStatus(statusBase);

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
