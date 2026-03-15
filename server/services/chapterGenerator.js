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
    role: '개발자 부트캠프 수석 강사이자 프로그래밍 교육 콘텐츠 전문가',
    audience: '프로그래밍 학습자',
    philosophy: '코드는 한 줄씩 직접 쳐보면서 실수하고 고치는 과정에서 배운다',
    style: '점진적 코드 빌드업, 의도적 에러 경험, 실무 연결',
    tone: '같이 코딩하는 선배 개발자처럼 친근하고 격려하는 톤',
  },
  'school-textbook': {
    role: '한국 검인정 교과서를 집필하는 교육과정 전문가',
    audience: '학생',
    philosophy: '호기심에서 출발하여 탐구를 통해 개념에 도달하고, 실생활에서 의미를 발견하게 한다',
    style: '생각 열기 → 탐구 활동 → 개념 정리 → 확인 문제 → 단원 정리 구조',
    tone: '정확하고 체계적이되 학생 눈높이에 맞는 친근한 톤',
  },
  'business-education': {
    role: '기업 교육 컨설턴트이자 HRD 전문가 — 맥킨지, BCG 출신 컨설턴트처럼 프레임워크와 케이스 스터디로 가르치는 전문가',
    audience: '비즈니스 전문가 및 직장인 (팀장급 관리자, 사업기획자, 마케터, 창업 준비자)',
    philosophy: '내일 출근해서 바로 쓸 수 있는 프레임워크와 도구를 제공한다',
    style: '케이스 스터디 + 프레임워크 + 실무 워크시트 중심, 컨설팅 보고서 수준의 논리 구조',
    tone: '전문적이고 신뢰감 있되, 실무자가 편하게 읽을 수 있는 톤',
  },
  'workshop-material': {
    role: '워크숍 퍼실리테이터이자 교육 프로그램 디자이너',
    audience: '워크숍 참가자',
    philosophy: '최고의 워크숍은 참여자가 직접 체험하고 만들며 배우는 것이다',
    style: '퍼실리테이터 가이드 형식, 활동 중심, 분 단위 타임라인 포함',
    tone: '활기차고 참여를 유도하며, 진행자에게는 구체적이고 실용적인 톤',
  },
  'self-directed-learning': {
    role: '자기주도학습 설계 전문가이자 성인교육 코치 — 혼자 공부하는 학습자가 절대 막히지 않는 학습서를 만드는 전문가',
    audience: '독학하는 입문자',
    philosophy: '선생님 없이도 이것만 읽으면 된다 — 매 단계마다 확인하고, 막히면 빠져나올 길을 제공한다',
    style: '동기부여 → 개념(비유 우선) → 체크포인트 → 안내된 실습 → FAQ/트러블슈팅 → 성취 확인',
    tone: '옆에 앉은 친절한 선배처럼 따뜻하고 격려하는 톤',
  },
  'teacher-guide-4c': {
    role: '현직 수석교사이자 교육과정 전문가 — 4C 역량(창의·비판·소통·협업) 기반 교사용 지도서를 집필하는 전문가',
    audience: '교사 및 교육 기획자',
    philosophy: '가르치는 것이 아니라 배움이 일어나도록 돕는다 — 교사가 이 지도안만 보고 수업을 실행할 수 있어야 한다',
    style: '도입-전개-정리 수업 지도안, 구체적 발문과 학생 예상 반응, 4C 역량 연계 활동 설계, 평가 루브릭 포함',
    tone: '전문적이고 체계적이되 현장 교사가 바로 활용할 수 있는 실용적인 톤',
  },
  'storytelling': {
    role: '사실에 기반한 교양서를 쓰는 저자 — 정확하면서도 읽기 쉬운 글을 쓰는 전문가',
    audience: '호기심 있는 일반 독자',
    philosophy: '좋은 교양서는 정확한 사실 위에 흥미로운 이야기를 쌓는다 — 과장 없이도 충분히 흥미롭다',
    style: '격식체(-입니다/-습니다) 교양서 스타일 — 사실 기반 서사, 절제된 톤',
    tone: '신뢰감 있고 지적이며 절제된 톤 — 과장과 멜로드라마 없이 사실의 힘으로 전달',
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
      'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
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
    // 사용자가 설정한 max_tokens를 존중 — 시간 기반 캡은 프롬프트로 분량 제어
    // 단, estimated_time이 매우 짧은 경우(30분 이하)에만 가벼운 캡 적용
    if (timeMinutes > 0 && timeMinutes <= 30) {
      const timeCap = Math.max(6000, Math.floor(timeMinutes * 200));
      return Math.min(userMaxTokens, timeCap);
    }
    return userMaxTokens;
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
      content: this._sanitizeContent(result.content),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      stopReason: result.stopReason,
    };
  }

  /**
   * AI 생성 콘텐츠 후처리 — Mermaid 내 리터럴 \n 제거, 코드블록 정리
   */
  _sanitizeContent(content) {
    if (!content) return content;

    // Mermaid 블록 내 리터럴 \n을 <br/>로 교체
    content = content.replace(/```mermaid\s*\n([\s\S]*?)```/g, (match, body) => {
      // 리터럴 백슬래시+n을 <br/>로 변환
      const cleaned = body.replace(/\\n/g, '<br/>');
      return '```mermaid\n' + cleaned + '```';
    });

    // 일반 텍스트에서 리터럴 \n 제거 (코드블록 밖)
    // 코드블록 내부는 건드리지 않음
    const parts = content.split(/(```[\s\S]*?```)/g);
    for (let i = 0; i < parts.length; i++) {
      // 홀수 인덱스 = 코드블록 내부 (이미 Mermaid 처리됨)
      if (i % 2 === 0) {
        // 코드블록 밖에서 리터럴 \n 제거 (실제 개행은 유지)
        parts[i] = parts[i].replace(/\\n/g, '\n');
      }
    }
    content = parts.join('');

    return content;
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

    // 사용자 작성 가이드라인 로드
    let guidelinesText = '';
    const guidelinesFile = join(this.projectPath, 'generation_guidelines.md');
    if (existsSync(guidelinesFile)) {
      const raw = (await readFile(guidelinesFile, 'utf-8')).trim();
      if (raw) {
        guidelinesText = `\n# 📝 작성자 가이드라인 (반드시 준수!)\n${raw}\n`;
      }
    }

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
- 예시/예제: 핵심만 포함, 부가 설명 최소화

## 절대 금지
- ${charMax.toLocaleString()}자를 초과하는 분량 작성 절대 금지
- **출력 토큰 10,000 이내** (이 한도를 초과하면 응답이 잘립니다! 반드시 10,000 토큰 이내로 마무리하세요)
- 하나의 차시에 너무 많은 개념을 담지 마세요
- 이것은 ${effectiveTimeLabel} 수업 **한 차시** 분량입니다 (전체 교재가 아님!)
- 내용이 길어질 것 같으면 핵심만 남기고 과감히 줄이세요
`;
    }

    const pc = this._getPromptConfig();
    const isCompact = effectiveMinutes <= 60;
    const templateId = this.templateInfo.template_id || '';
    const isProgramming = templateId === 'programming-course';
    const isStorytelling = templateId === 'storytelling';
    const isSelfDirected = templateId === 'self-directed-learning';
    const isTextbook = templateId === 'school-textbook';
    const isBusinessEdu = templateId === 'business-education';
    const isWorkshop = templateId === 'workshop-material';
    const isTeacherGuide = templateId === 'teacher-guide-4c';

    let docStructure;

    if (isTeacherGuide) {
      // 교사용 지도서: 수업 지도안 전용 구조 (도입-전개-정리)
      docStructure = `# 교사용 지도서 문서 구조 (필수 - ${effectiveTimeLabel} 차시용)

이 문서는 **교사가 이것만 보고 수업을 진행할 수 있는 완전한 차시 지도안**입니다.
학생용 교재가 아닙니다. 교사의 행동, 발문, 판단 기준을 구체적으로 작성하세요.

## 📌 차시 개요
- 차시 번호, 주제, 성취기준(교육과정 기반)
- 학습목표 (행동 목표: "~를 설명할 수 있다")
- 4C 역량 (이 차시에서 강화할 역량과 해당 활동)
- 준비물 (교사용 / 학생용)
- 선수학습 요소

## 🎯 수업 흐름 (${effectiveTimeLabel} 기준)

### 1️⃣ 도입 (5~7분)
- 동기유발 (구체적 상황/자료/질문)
- 선수학습 확인 발문 + 예상 답변
- 학습목표 제시

### 2️⃣ 전개 (28~35분) -- 활동 2~3개
각 활동마다 반드시 포함:
- **활동명 + 시간** (예: "활동 1: 힘의 방향 탐구 (12분)")
- **4C 연결**: 어떤 역량을 왜 기르는지
- **교사 행동**: 구체적 지시
- **학생 활동**: 구체적 행동
- **핵심 발문** 2~3개 + 예상 답변
- **예상 어려움 & 교사 대처법**
- **수준별 지도**: 상위 심화 / 하위 지원

### 3️⃣ 정리 (5~10분)
- 핵심 내용 정리 방법
- 성찰 질문
- 형성평가 2~3문항 (정답 + 오답 분석)
- 자기평가 체크리스트
- 다음 차시 예고

## 📊 평가 루브릭
- 평가 요소 3개 이상, 상/중/하 기술 (관찰 가능한 행동)

## 📄 학생용 활동지 (간략)
- 배부할 활동지 핵심 내용

## 💡 교사용 참고 (수업 TIP)
- 시간 조절 팁, 변형 아이디어, 배경 지식, 자주 나오는 질문과 답변

## 절대 금지
- 학생용 교재 형태 금지
- 발문 없이 개념만 나열 금지
- 시간 배분 없는 활동 설계 금지
- ASCII art 절대 금지`;
    } else if (isWorkshop) {
      // 워크숍: 퍼실리테이터 가이드 + 타임라인 + 워크시트
      docStructure = `# 워크숍 세션 구조 (필수 -- 퍼실리테이터 운영 가이드, ${effectiveTimeLabel})

## 🎯 세션 개요
- **세션 제목**: [제목]
- **소요 시간**: ${effectiveTimeLabel}
- **학습 목표**: (참여자가 이 세션 후 할 수 있는 것 2-3개)
- **준비물**: (포스트잇, 마커, A3 용지, 타이머 등 구체적으로)
- **공간 배치**: (섬 배치/원형/극장식 등)

## ⏱️ 타임라인 (분 단위 -- 모든 시간을 빠짐없이 배분)
형식:
- **0:00~0:10 (10분)** | 아이스브레이커 | 전체 | 에너지 UP
- **0:10~0:20 (10분)** | 핵심 개념 도입 | 강의 | 최소 강의
- **0:20~0:45 (25분)** | 그룹 실습 | 4인 조 | 워크시트 활용
- ... (총합 = ${effectiveTimeLabel})

## 🧊 오프닝 & 아이스브레이커
- 구체적 아이스브레이커 활동 1개 (이름, 진행법, 소요시간)
- 💬 **퍼실리테이터 멘트**: "실제로 할 말 직접 작성"
- 진행 방법 단계별 안내

## 📚 핵심 개념 도입 (전체 시간의 20% 이내!)
- 강의 아닌 **체험형 도입** (질문, 시연, 짧은 영상 등)
- 💬 **퍼실리테이터 발문**: "핵심 질문 직접 작성"
- 참여자가 스스로 발견하게 하는 설계

## 🔨 핵심 활동 (전체 시간의 50% 이상!)
### 활동 1: [활동명] (00분)
- **활동 유형**: 개인/짝/4인조/전체
- **목적**: 참여자가 얻는 것
- **진행 방법**: 1. ... 2. ...
- **조 구성**: (방법, 역할 -- 기록자/발표자/타임키퍼)
- **결과물**: (포스터/워크시트/프로토타입 등)
- 💬 **전환 멘트**: "다음 활동 전환 시 할 말"

### 📋 참여자용 워크시트 (활동마다 1개씩 제공!)
> (마크다운 인용구 블록으로 바로 인쇄 가능한 워크시트)
> **[워크시트 제목]**
> 이름: ____________  조: ____________
> 1. ________________________________
> 2. ________________________________
>
> (각 핵심 활동에 대응하는 워크시트를 반드시 제공하세요)
> (빈 칸, 체크박스, 프레임워크 템플릿 등 참여자가 직접 채울 수 있는 형식)

## 🎤 공유 & 피드백
- 발표 형식 (갤러리워크/3분 발표/월드카페 등)
- 피드백 프레임 ("좋은 점 + 궁금한 점 + 제안")
- 💬 **퍼실리테이터 멘트**: "공유 세션 시작 멘트"

## 💭 성찰 & 마무리
- 성찰 질문 (1-2개)
- 액션 플랜: "내일부터 바로 실천할 것 1가지"
- 💬 **클로징 멘트**: "마무리 인사"

## ⚠️ 퍼실리테이터 FAQ & 대처 가이드
- 예상 질문 2-3개와 대처법
- 시간 초과/부족 시 조절법
- 참여도 낮은 그룹 대처법

## 🔗 다음 세션 예고`;
    } else if (isBusinessEdu) {
      // 비즈니스 교육: 케이스 스터디 + 프레임워크 + 실무 워크시트 중심
      docStructure = isCompact
        ? `# 문서 구조 (비즈니스 교육 - 경량 버전, ${effectiveTimeLabel} 차시용)

## 💼 비즈니스 임팩트
- 이 주제가 비즈니스 성과에 미치는 영향 (수치/사실 기반, 2-3줄)
- "왜 지금 이것을 알아야 하는가?"에 대한 명확한 답

## 🧭 핵심 프레임워크
### 프레임워크: [이름]
1. 프레임워크 개요 (한 문단)
2. Mermaid 다이어그램으로 시각화
3. 구성 요소별 설명 (볼드+목록)

> **실무 TIP**: [바로 적용 가능한 구체적 팁]

## 📊 케이스 스터디 (성공 1개 + 실패/교훈 1개, 반드시 2개)
### 사례 1: [기업명] — 성공 사례
- **상황**: 기업이 처한 맥락과 과제 (기업명, 시기, 수치 필수)
- **실행**: 어떤 전략/프레임워크를 어떻게 적용했는가
- **결과**: 구체적 수치와 성과
- **시사점**: 우리 조직에 적용할 핵심 교훈
### 사례 2: [기업명] — 실패에서 배우기
- (동일 구조)

## 🤔 의사결정 시나리오
**상황**: [구체적 비즈니스 상황]
**당신은 [직책]입니다. 어떤 선택을 하시겠습니까?**
- **선택지 A/B**: 각각의 장단점
<details><summary>전문가 분석 보기</summary>[분석 + 추천 판단 기준]</details>

## 🔧 실무 워크시트
(빈 템플릿 + 작성 예시 — 학습자가 자기 조직에 바로 적용)

## 📋 액션 플랜
- **이번 주**: [즉시 실행 항목 1-2개]
- **이번 달**: [단기 적용 항목 1-2개]

## ✅ 실무 체크리스트
- [ ] (예/아니오로 답할 수 있는 자가 진단 항목 3-5개)

## 🔗 다음 장 미리보기`
        : `# 문서 구조 (비즈니스 교육 - 전체 버전)

## 💼 비즈니스 임팩트
- 이 주제가 비즈니스 성과에 미치는 영향 (수치/사실 기반)
- 시장 트렌드, 산업 데이터 인용
- "왜 지금 이것을 알아야 하는가?"에 대한 명확한 답

## 🧭 핵심 프레임워크
### 프레임워크 1: [이름]
1. 프레임워크 개요 및 탄생 배경
2. Mermaid 다이어그램으로 시각화
3. 구성 요소별 상세 설명 (볼드+목록)
4. 활용 시나리오별 변형

> **실무 TIP**: [바로 적용 가능한 구체적 팁]

## 📊 케이스 스터디 (2개: 성공 1 + 실패/교훈 1)
### 사례 1: [기업명] — 성공 사례
- **상황(Situation)**: 기업이 처한 맥락과 과제
- **과제(Task)**: 해결해야 할 핵심 문제
- **실행(Action)**: 어떤 전략/프레임워크를 어떻게 적용했는가
- **결과(Result)**: 구체적 수치와 성과
- **시사점**: 우리 조직에 적용할 핵심 교훈

### 사례 2: [기업명] — 실패에서 배우기
- (동일 구조)

## 🤔 의사결정 시나리오
**상황**: [구체적 비즈니스 상황 설정]
**당신은 [직책]입니다. 어떤 선택을 하시겠습니까?**
- **선택지 A**: [설명] → 장점/리스크
- **선택지 B**: [설명] → 장점/리스크
- **선택지 C**: [설명] → 장점/리스크
<details><summary>전문가 분석 보기</summary>[각 선택지 분석 + 추천 판단 기준]</details>

## 🔧 실무 워크시트
### 빈 템플릿
(학습자가 자기 조직 데이터로 채울 수 있는 빈 프레임워크)

### 작성 예시
(가상 기업 "ABC Corp"으로 작성한 완성 예시)

## 📋 액션 플랜
- **이번 주**: [즉시 실행 항목]
- **이번 달**: [단기 적용 항목]
- **3개월 내**: [중기 성과 목표]

## ✅ 실무 체크리스트
- [ ] (예/아니오로 답할 수 있는 자가 진단 항목 5-7개)

## 🔗 다음 장 미리보기`;
    } else if (isStorytelling) {
      // 스토리텔링: 지적 교양서 스타일 — 격식체, 절제된 서사
      docStructure = `# 글쓰기 형식 (스토리텔링, ${effectiveTimeLabel} 차시용)

이 챕터는 **신뢰할 수 있는 교양서의 한 챕터**처럼 작성하세요.
장하석의 《온도 계량의 철학》이나 정재승의 《열두 발자국》처럼 정확하면서도 읽기 쉬운 글이어야 합니다.

## 절대 금지 사항 (최우선)
- **❌ 프로그래밍 코드 블록 절대 사용 금지** — Python, JavaScript 등 어떤 언어든 코드를 포함하지 마세요
- ❌ '개념 정리', '핵심 요약', '정리하면' 같은 교과서식 섹션 금지
- ❌ 불릿포인트로 개념을 나열하는 방식 금지

## 문체 규칙
- **반드시 격식체(-입니다, -습니다, -했습니다)로 작성**
- 과장 금지: "아무도 몰랐다", "놀랍게도", "충격적이게도" 사용 금지
- 상투적 수사 금지: "마치 ~처럼"이 문단마다 반복되면 안 됩니다
- 감정적 수식어 금지: "위대한", "혁명적인", "전설적인" 대신 사실로 보여주세요
- 저렴한 클리프행어 금지: "그 답은 다음 장에서" 같은 표현 쓰지 마세요

## 구조 원칙
- 정해진 섹션 틀(🎯, 📚, 🔨 등)을 사용하지 마세요
- 소제목(##)은 내용에 맞게 명확하게 붙이세요
- 챕터 전체가 하나의 연속된 흐름이어야 합니다
- 구체적인 연도, 인물, 데이터에 기반하여 서술하세요

## 챕터 마무리 (유일한 고정 요소)
이야기가 끝난 후, 맨 아래에만:
\`\`\`
---

## 💭 생각해보기
- (이야기에서 파생되는 사고 확장 질문 2~3개)
\`\`\`

## 절대 금지
- ❌ 프로그래밍 코드 블록 사용 금지
- ❌ "이 장의 핵심", "핵심 요약", "정리하면", "학습목표" 같은 교과서식 섹션 금지
- ❌ 불릿포인트로 개념을 나열하는 방식 금지
- ❌ "~란 ~을 의미한다" 식의 사전적 정의 금지`;
    } else if (isTextbook) {
      // 학교 교과서: 한국 검인정 교과서 표준 구조
      docStructure = isCompact
        ? `# 교과서 구조 (필수 - ${effectiveTimeLabel} 차시용)

## 생각 열기
> (실생활 현상, 사진 묘사, 또는 흥미로운 질문 1개)

## 이 단원의 학습 목표
- ~할 수 있다. (2~3개)

## 선수학습 확인
(이전에 배운 관련 개념 2~3줄 복습)

## 탐구 활동
### 탐구: [활동 제목]
- **준비물**: ...
- **과정**: 1. ... 2. ... 3. ...
- **결과 예측**: "어떤 결과가 나올까요?"
- **토의**: "왜 이런 결과가 나왔을까요?"

## 핵심 개념
### [개념명]
- **정의**: ...
- **비유**: "~는 마치 ~와 같습니다"
- **[그림 번호] 설명**: (시각 자료 지시)

\`\`\`mermaid
(핵심 개념 다이어그램)
\`\`\`

## 읽을거리
> (관련 과학사 에피소드 또는 실생활 응용, 3~5줄)

## 확인 문제
### 기본 (개념 확인) 1. ... 2. ...
### 응용 (적용) 3. ...
### 심화 (사고력) 4. (서술형) ...
<details><summary>정답 확인</summary>1. ... 2. ... 3. ... 4. (예시 답안)</details>

## 단원 정리
- **핵심 개념 요약**: ...
- **다음 차시 예고**: "다음 시간에는 ~에 대해 알아봅니다"`
        : `# 교과서 구조 (필수)

## 생각 열기
> (실생활 현상, 사진 묘사, 또는 흥미로운 질문 1개)

## 이 단원의 학습 목표
- ~할 수 있다. (3~4개)

## 선수학습 확인
(이전에 배운 관련 개념 복습)

## 탐구 활동 1
### 탐구: [활동 제목]
- **탐구 유형**: 실험형 / 관찰형 / 조사발표형 / 토론형 / 모델링형
- **활동 형태**: 개인 / 모둠(4인)
- **준비물**: ...
- **과정**: 1. ... 2. ... 3. ... 4. ...
- **결과 정리**: "관찰한 내용을 정리해 봅시다"
- **토의**: "이 결과로부터 어떤 규칙을 발견할 수 있나요?"

## 핵심 개념 1: [개념명]
- **정의**: ...
- **비유/예시**: ...
- **원리 설명**: ...
- **[그림 번호] 설명**: (시각 자료 지시)

\`\`\`mermaid
(핵심 개념 다이어그램)
\`\`\`

## 핵심 개념 2: [개념명]
- (동일 구조 반복)

## 탐구 활동 2 (선택)
### 탐구: [활동 제목]
- (동일 구조)

## 읽을거리 — [제목]
> (관련 과학자 이야기, 발견 에피소드, STS 연계 등 5~8줄)

## 확인 문제
### 기본 (개념 확인) 1. ... 2. ...
### 응용 (적용) 3. ... 4. ...
### 심화 (사고력) 5. (서술형) ...
<details><summary>정답 확인</summary>1. ... 2. ... 3. ... 4. ... 5. (예시 답안)</details>

## 단원 정리
- **핵심 개념 요약**: (볼드+목록으로 정리)
- **이 단원에서 배운 것**: ...
- **실생활 연계**: "오늘 배운 내용은 일상에서 ~와 관련이 있습니다"
- **다음 차시 예고**: "다음 시간에는 ~에 대해 알아봅니다"`;
    } else if (isSelfDirected) {
      // 자기주도학습: 혼자서도 막히지 않는 친절한 학습서 구조
      docStructure = isCompact
        ? `# 문서 구조 (자기주도 학습서 - 경량 버전, ${effectiveTimeLabel} 차시용)

## 🚀 이 장을 시작하기 전에
> (이 장에서 배울 내용이 왜 필요한지, 실생활 예시로 동기부여 — 2-3문장)

## 🎯 이 장의 학습 목표
이 장을 마치면 여러분은:
- ✅ ~할 수 있습니다
- ✅ ~를 이해할 수 있습니다
⏰ 예상 학습 시간: 약 XX분

## 🔑 미리 확인해요
> 이전 장 핵심 1-2개 간단 복습 (없으면 생략)

## 📚 핵심 개념 (하나씩 차근차근)
### 개념: [이름]
1. 일상 비유로 시작
2. 정확한 설명
3. 예시로 확인
> 🔍 **체크포인트**: ~를 한 문장으로 설명할 수 있나요? 할 수 있다면 다음으로! 💪

## 🔧 직접 해봐요
### 실습: (제목)
**따라하기** (한 단계씩!):
1. [단계] — 설명
   > ✅ 확인: ~가 보여야 해요
   > ❓ 안 되나요? → [해결법]
2. [단계] — 설명
🎉 잘 되셨나요? 축하해요!

## ❓ 자주 묻는 질문 & 막혔을 때
<details><summary>Q. ~가 안 돼요</summary>해결법</details>
<details><summary>Q. ~가 헷갈려요</summary>쉬운 설명</details>

## 📌 이 장에서 배운 것 정리
> 🏆 **오늘의 성취**: 여러분은 이제 ~할 수 있어요!
- ✅ 핵심 1
- ✅ 핵심 2

## 🤔 스스로 점검해봐요
- [ ] ~를 설명할 수 있나요?
- [ ] ~를 직접 해볼 수 있나요?
> 💡 어렵다면? 해당 부분만 다시 읽어보세요. 괜찮아요!

## 🚀 다음 장 미리보기`
        : `# 문서 구조 (자기주도 학습서, ${effectiveTimeLabel} 차시용)

## 🚀 이 장을 시작하기 전에
> (이 장에서 배울 내용이 왜 필요한지, 실생활 예시나 흥미로운 에피소드로 동기부여)
> "이걸 배우면 ~할 수 있게 돼요!"

## 🎯 이 장의 학습 목표
이 장을 마치면 여러분은:
- ✅ ~할 수 있습니다
- ✅ ~를 이해할 수 있습니다
- ✅ ~를 직접 해볼 수 있습니다
⏰ 예상 학습 시간: 약 XX분

## 🔑 미리 확인해요 (선수 지식 체크)
> 아래 내용이 익숙하지 않다면, [이전 장]을 먼저 복습해주세요.
> - (이전 장 핵심 1) — 기억나시나요?
> - (이전 장 핵심 2)

## 📚 핵심 개념 (하나씩 차근차근)
### 개념 1: [이름]
1. 일상 비유로 시작: "~는 마치 ~와 같아요"
2. 정확한 설명
3. 구체적 예시로 확인
4. "만약 여기서 헷갈린다면, ~만 기억하세요"

> 🔍 **체크포인트**: ~를 한 문장으로 설명할 수 있나요?
> - 할 수 있다면 → 다음으로 넘어가세요! 잘하고 계세요! 💪
> - 아직 헷갈린다면 → 위의 설명을 한 번 더 읽어보세요. 괜찮아요!

### 개념 2: [이름]
(같은 패턴 반복)

## 🔧 직접 해봐요
### 실습: (제목)
**이 실습의 목표**: ~
**준비물**: ~

**따라하기** (천천히 한 단계씩!):
1. [첫 번째 단계] — 설명
   > ✅ 확인: 이 단계가 끝나면 ~가 보여야 해요
   > ❓ 안 되나요? → [구체적 해결 방법]
2. [두 번째 단계] — 설명
   > ✅ 확인: ~
3. [세 번째 단계]
   > ✅ 확인: ~

🎉 **잘 되셨나요?** 축하해요! 방금 여러분은 ~를 해냈어요!

## ❓ 자주 묻는 질문 & 막혔을 때
<details><summary>Q. ~가 안 돼요 / ~에서 막혀요</summary>

가장 흔한 원인:
1. **원인 1**: ~ → 해결: ~
2. **원인 2**: ~ → 해결: ~
3. **그래도 안 된다면**: ~를 확인해보세요

</details>

<details><summary>Q. ~와 ~의 차이가 뭔가요?</summary>

쉽게 말하면 ~입니다. 비유하자면 ~

</details>

<details><summary>Q. 이걸 왜 이렇게 하나요?</summary>

좋은 질문이에요! ~

</details>

## 📌 이 장에서 배운 것 정리
> 🏆 **오늘의 성취**: 여러분은 이제 ~할 수 있게 되었어요!
- ✅ (핵심 1): 한 줄 요약
- ✅ (핵심 2): 한 줄 요약
- ✅ (핵심 3): 한 줄 요약

## 🤔 스스로 점검해봐요
아래 질문에 "예"라고 답할 수 있다면, 다음 장으로 넘어가도 좋아요!
- [ ] ~를 설명할 수 있나요?
- [ ] ~를 직접 해볼 수 있나요?
- [ ] ~가 왜 중요한지 이해했나요?

> 💡 1-2개가 아직 어렵다면? 해당 부분만 다시 읽어보세요.
> 전부 어렵다면? 이전 장을 복습하고 돌아와주세요. 천천히 해도 괜찮아요!

## 🚀 다음 장 미리보기
다음 장에서는 ~를 배워볼 거예요. 기대되시죠?`;
    } else if (isProgramming) {
      // 프로그래밍 전용: 점진적 빌드업 + 에러 경험 + 실무 연결
      docStructure = isCompact
        ? `# 문서 구조 (프로그래밍 경량 버전, ${effectiveTimeLabel} 차시용)

## 🎯 이 장에서 배우는 것
- [ ] ...할 수 있다 (2-3개 체크박스)
- 실행 환경: Python 3.10+ / Node.js 18+ 등 명시

## 💡 왜 이걸 배우나요?
(이 문법/개념이 없으면 어떤 문제를 해결할 수 없는지 — 실제 상황으로 동기 부여)

## 📚 개념 잡기
### [개념 이름]
1. 일상 비유: "~는 마치 ~와 같아요"
2. 정확한 정의 (한 줄)
3. 가장 짧은 코드 예시 (2~3줄)
4. **개념-코드 연결**: "위 코드의 N번째 줄 \`...\`이 바로 [개념]입니다"

## 🔨 코드 빌드업 (점진적으로!)
### v1: 기본 동작 (3~5줄)
\`\`\`python
# 가장 단순한 버전
\`\`\`
**실행 결과**:
\`\`\`
[출력]
\`\`\`
**핵심 포인트**: v1에서 주목할 부분 설명

### v2: 기능 추가
\`\`\`python
# v1에서 [무엇]을 추가/변경
\`\`\`
**v1 대비 변경점**: 어떤 줄이 왜 바뀌었는지

## 🐛 에러 경험
> 아래 코드를 실행하면 어떤 에러가 날까요? 먼저 예상해보세요!
\`\`\`python
[의도적으로 틀린 코드]
\`\`\`
**에러 메시지**:
\`\`\`
[실제 에러 메시지 전문]
\`\`\`
**원인**: 왜 이런 에러가 나는지
**수정**: 고친 코드

## ✅ 연습 문제
### 기초 (따라하기 변형)
<details><summary>힌트</summary>...</details>
<details><summary>정답</summary>코드 + 설명</details>

### 도전 (새로운 상황 적용)
<details><summary>힌트</summary>...</details>
<details><summary>정답</summary>코드 + 설명</details>

## 🏢 실무에서는 이렇게 씁니다
(이 문법이 실제 프로젝트에서 어떻게 쓰이는지 1~2가지 구체 사례)

## 🔗 다음 장 미리보기`
        : `# 문서 구조 (프로그래밍 전용, ${effectiveTimeLabel} 차시용)

## 🎯 이 장에서 배우는 것
- [ ] ...할 수 있다 (3-5개 체크박스)
- 실행 환경: Python 3.10+ / Node.js 18+ 등 명시
- 필요한 설치: pip install ... (있는 경우)

## 💡 왜 이걸 배우나요?
(이 개념 없이 코드를 짜면 어떤 고통이 있는지 — "before/after" 시나리오)

## 📚 개념 잡기
### 개념 1: [이름]
1. 일상 비유: 복잡한 개념을 친숙한 것에 비유
2. 정확한 정의 (한 줄)
3. 가장 짧은 코드 예시 (2~3줄)
4. **개념-코드 연결**: "위 코드의 N번째 줄 \`...\`이 바로 [개념]입니다"

### 개념 2: [이름]
(같은 패턴 반복)

## 🔨 코드 빌드업 (점진적으로 발전!)
**중요**: 완성 코드를 바로 보여주지 마세요! 단계별로 진화시키세요.

### v1: 가장 기본적인 동작 (3~5줄)
\`\`\`python
# 최소한의 동작만 하는 코드
\`\`\`
**실행 결과**:
\`\`\`
[출력]
\`\`\`
**핵심 포인트**: v1의 특징과 한계

### v2: 한 가지 기능 추가
\`\`\`python
# v1에서 [기능]을 추가
\`\`\`
**v1 대비 변경점**: 어떤 줄이 왜 바뀌었는지 명확히 표시

### v3: 개선 & 리팩토링
\`\`\`python
# v2를 더 깔끔하게 / 더 효율적으로
\`\`\`
**v2 대비 변경점**: 코드가 어떻게 나아졌는지

### 최종 완성 코드
\`\`\`python
# 실행 가능한 완성 코드 (import부터 출력까지)
\`\`\`

## 🐛 에러 경험 코너 (최소 2개)
### 실수 1: [흔한 에러 이름]
> 아래 코드를 실행하면 어떤 에러가 날까요? 먼저 예상해보세요!
\`\`\`python
[의도적으로 틀린 코드]
\`\`\`
**에러 메시지**:
\`\`\`
[에러 메시지 전문 — 생략 없이]
\`\`\`
**원인 분석**: 왜 이 에러가 발생하는지
**수정 코드**: 고친 코드와 설명

### 실수 2: [에러 이름]
(같은 패턴)

## ✅ 연습 문제 (3단계)
### 기초: [문제 제목] (예제 코드 변형 수준)
문제 설명
<details><summary>힌트</summary>힌트 내용</details>
<details><summary>정답 코드</summary>

\`\`\`python
[정답]
\`\`\`
설명
</details>

### 응용: [문제 제목] (새로운 상황에 적용)
문제 설명
<details><summary>힌트</summary>힌트 내용</details>
<details><summary>정답 코드</summary>

\`\`\`python
[정답]
\`\`\`
설명
</details>

### 도전: [문제 제목] (이전 챕터와 결합 / 스스로 설계)
문제 설명
<details><summary>힌트</summary>힌트 내용</details>
<details><summary>정답 코드</summary>

\`\`\`python
[정답]
\`\`\`
설명
</details>

## 🏢 실무에서는 이렇게 씁니다
(이 문법/패턴이 실제 프로젝트에서 어떻게 쓰이는지 구체적 사례 2~3개)
- 웹 개발에서: ...
- 데이터 분석에서: ...
- 자동화에서: ...

## 📋 이 장의 키워드 정리
(핵심 용어 3~5개와 한 줄 정의)

## 🔗 다음 장 미리보기
(다음 챕터에서 이 코드를 어떻게 확장하는지 티저)`;
    } else {
      // 일반 교육자료: 코드 블록 없음, 내용 중심
      docStructure = isCompact
        ? `# 문서 구조 (필수 - 경량 버전, ${effectiveTimeLabel} 차시용)

## 🎯 이 장에서 배우는 것
- [ ] ...할 수 있다 (2-3개 체크박스)

## 📚 핵심 개념
### 개념: [이름]
1. 비유로 시작: "~는 마치 ~와 같아요"
2. 정확한 정의
3. 예시로 확인

## 🔨 따라하기 / 활동
### Step 1: [소제목]
(구체적인 활동이나 실습 안내)

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

## 🔨 따라하기 / 활동

## ⚠️ 자주 하는 실수 (최소 3개)

## ✅ 스스로 점검하기

## 🚀 더 해보기

## 🔗 다음 장으로`;
    }

    if (isTeacherGuide) {
      return `당신은 현직 교사 경력 20년의 수석교사이자 교육과정 전문가입니다.
교사용 지도서를 집필하며, 수업 현장에서 바로 사용할 수 있는 실용적인 지도안을 작성합니다.

# 핵심 철학
"가르치는 것이 아니라, 배움이 일어나도록 돕는다"
- 4C 역량(창의성, 비판적 사고, 소통, 협업)을 수업의 모든 활동에 자연스럽게 녹여냅니다
- ${pc.style}

# 대상 독자
**${pc.audience}** (이 문서를 읽고 바로 수업을 진행할 교사)

# 작성할 차시 지도안 정보
**ID**: ${chapterId}
**주제**: ${chapterTitle}
${partContext}
${timeConstraint}

# 차시 개요 (참고용)
${outline || '개요 없음'}

# 참고자료
${refsText}

${docStructure}

# 작성 원칙 (교사용 지도서 전용)
- **수업 실행 가능성**: 이 지도안만 읽고 수업을 바로 진행할 수 있어야 합니다
- **교사의 언어로**: 교사가 실제로 교실에서 할 말(발문)을 큰따옴표로 구체적으로 적으세요
- **학생 예상 반응**: 모든 발문에 학생의 예상 답변을 2~3가지 포함하세요
- **시간 배분 필수**: 모든 활동에 분 단위 시간을 명시하고 합계가 차시 시간과 일치해야 합니다
- **4C 역량 연결**: 각 활동이 어떤 4C 역량을 왜 기르는지 명시적으로 적으세요
- **수준별 지도**: 모든 핵심 활동에 상위/하위 학생 대응 방법을 포함하세요
- **평가 루브릭**: 관찰 가능한 행동으로 상/중/하를 기술하세요
- **톤앤매너**: ${pc.tone}
- **시각 자료**: 다이어그램은 반드시 Mermaid 코드블록 사용
- **마크다운 테이블 허용**: 교사용 지도서에서는 차시 개요, 수업 흐름, 루브릭 등에 테이블 사용 가능
- **ASCII art 절대 금지**: 텍스트로 그림/도표/박스를 그리지 마세요

${guidelinesText}
# 마크다운 형식으로 완전한 차시 지도안을 작성해주세요.
위 구조를 반드시 모두 포함하되, 교사가 바로 수업에 활용할 수 있는 구체성이 최우선입니다.
${templateAddition}
`;
    }

    if (isWorkshop) {
      return `당신은 ${pc.role}입니다.
IDEO, 스탠포드 d.school, 구글 디자인 스프린트 수준의 워크숍을 설계하고 퍼실리테이션합니다.

# 핵심 철학
"${pc.philosophy}"
- ${pc.style}

# 대상 참여자
**${pc.audience}**
- 강의를 듣기보다 직접 체험하고, 만들고, 토론하며 배우길 원하는 참여자입니다
- 다양한 배경과 경험 수준이 섞여 있을 수 있습니다

# 작성할 워크숍 세션 정보
**ID**: ${chapterId}
**제목**: ${chapterTitle}
${partContext}
${timeConstraint}

# 세션 개요
${outline || '개요 없음'}

# 참고자료
${refsText}

${docStructure}

# 워크숍 자료 작성 핵심 원칙

## 퍼실리테이터 가이드 원칙
- 이 문서는 **퍼실리테이터가 인쇄해서 그대로 진행할 수 있는 완전한 운영 가이드**입니다
- 모든 활동에 **정확한 분 단위 시간 배분**을 명시하세요
- 퍼실리테이터가 실제로 말할 **발문, 전환 멘트, 오프닝/클로징 멘트**를 직접 작성하세요
- 💬 형식으로 멘트를 제공하세요

## 시간 관리
- 타임라인의 시간 총합이 반드시 ${effectiveTimeLabel}이 되어야 합니다
- 강의/개념 설명은 전체 시간의 **20% 이내**로 제한하세요
- 참여자 활동(실습, 토론, 발표)이 전체 시간의 **50% 이상**이어야 합니다
- 남은 시간은 오프닝, 공유/피드백, 성찰/마무리에 배분하세요

## 참여자 활동 설계
- 활동은 **단계별로 구체적**으로 안내하세요 (1. 2. 3. 형식)
- 그룹 활동 시 **조 구성 방법, 인원수, 역할 분담**을 명시하세요
- 각 활동의 **결과물**(포스터, 워크시트, 프로토타입 등)을 정의하세요
- 워크시트는 마크다운 인용구(>) 블록으로 바로 인쇄 가능하게 제공하세요
- **각 핵심 활동마다 전용 워크시트를 반드시 제공**하세요 (활동 1개 = 워크시트 1개)
- 워크시트에는 빈 칸, 체크박스, 프레임워크 템플릿 등 참여자가 직접 채울 수 있는 형식을 사용하세요
- 퍼실리테이터 시연 시 **무엇을 보여주고, 어떤 질문을 할지** 구체적 스크립트를 포함하세요

## 에너지 관리
- 세션 시작에 **아이스브레이커** 또는 **에너자이저**를 반드시 배치하세요
- 집중 활동 → 이완 활동 → 집중 활동의 **리듬**을 설계하세요
- 긴 세션(60분 초과)이면 중간에 에너자이저를 추가하세요

## 형식 규칙
- **톤앤매너**: ${pc.tone}
- **시각 자료**: 프로세스나 흐름은 Mermaid 다이어그램 사용 가능
- **마크다운 테이블 금지**: 파이프(|)와 대시(-)로 만드는 표 절대 금지! 볼드+목록으로 대체
- **ASCII art 절대 금지**
- 이모지는 섹션 제목에만 사용하고, 본문에서는 최소화하세요

${guidelinesText}
# 마크다운 형식으로 워크숍 세션 운영 가이드를 작성해주세요.
위 구조를 **반드시 모두** 포함하되, 분량 가이드를 철저히 준수하세요.
퍼실리테이터가 이 문서만으로 워크숍을 완벽하게 진행할 수 있어야 합니다.
${templateAddition}
`;
    }

    if (isBusinessEdu) {
      return `당신은 ${pc.role}입니다.
맥킨지, BCG, 하버드 비즈니스 리뷰에서 볼 수 있는 수준의 비즈니스 교육 콘텐츠를 만듭니다.

# 핵심 철학
"${pc.philosophy}"
- ${pc.style}

# 대상 독자
**${pc.audience}**
- 이론보다 "내일 회사에서 바로 써먹을 수 있는 것"을 원하는 실무자입니다
- 경영 용어에 어느 정도 노출되어 있지만, 깊은 전문 지식은 없을 수 있습니다

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

# 비즈니스 교육 작성 원칙

## 케이스 스터디 작성법
- 반드시 **실제 기업명, 시기, 구체적 수치**를 포함하세요
- STAR 프레임워크(Situation-Task-Action-Result)로 구조화하세요
- 성공 사례만이 아니라 **실패 사례와 그로부터의 교훈**도 포함하세요
- "우리 회사에 적용한다면?"이라는 시사점을 반드시 도출하세요

## 프레임워크 제시법
- 프레임워크는 **Mermaid 다이어그램**으로 시각화하세요
- 빈 템플릿 + 작성 예시를 반드시 함께 제공하세요
- 프레임워크의 한계와 주의사항도 언급하세요

## 경영 용어 처리
- 전문 용어가 처음 나올 때 괄호 안에 한 줄 설명을 추가하세요
  예: "MVP(최소 기능 제품 — 핵심 기능만 넣어 빠르게 시장 반응을 보는 것)"
- 이후에는 전문 용어 그대로 사용하세요 (과도한 풀어쓰기 금지)

## 의사결정 시나리오
- "당신이 [직책]이라면?" 형태의 상황 판단 문제를 포함하세요
- 2~3개 선택지와 각각의 장단점, 리스크를 제시하세요
- <details> 태그로 전문가 분석을 숨겨두세요

## 액션 아이템
- 추상적 "~해야 한다"가 아닌, **"언제까지, 무엇을, 어떻게"** 형식으로 구체화하세요
- 이번 주 / 이번 달 / 3개월 단위의 실행 로드맵을 제시하세요

## 형식 규칙
- **톤앤매너**: ${pc.tone}
- **시각 자료**: 프로세스, 프레임워크는 반드시 Mermaid 다이어그램 사용
- **마크다운 테이블 금지**: 파이프(|)와 대시(-)로 만드는 표 절대 금지! 볼드+목록 또는 Mermaid로 대체
- **ASCII art 절대 금지**: 텍스트로 그림/도표/박스를 그리지 마세요
- **프로그래밍 코드 블록 금지** (Mermaid 제외)
- 이모지는 섹션 제목에만 사용하고, 본문에서는 최소화하세요

${guidelinesText}
# 마크다운 형식으로 전체 챕터를 작성해주세요.
위 구조를 **반드시 모두** 포함하되, 분량 가이드를 철저히 준수하세요.
케이스 스터디의 구체성과 프레임워크의 실용성이 최우선입니다.
${templateAddition}
`;
    }

    if (isStorytelling) {
      return `당신은 정확한 사실에 기반하여 흥미로운 교양서를 쓰는 저자입니다.
장하석, 정재승, 칼 세이건처럼 어려운 주제를 명확하고 읽기 쉽게 전달하는 것이 당신의 강점입니다.

## 절대 금지 사항 (최우선, 반드시 준수)
- **❌ 프로그래밍 코드 블록 절대 사용 금지** — Python, JavaScript 등 어떤 언어든 코드를 포함하지 마세요
- ❌ '개념 정리', '핵심 요약', '정리하면' 같은 교과서식 섹션 금지
- ❌ 불릿포인트로 개념을 나열하는 방식 금지

## 문체 규칙 (반드시 준수)
- **격식체(-입니다, -습니다, -했습니다)로만 작성**하세요
- '~였죠', '~거든요', '~잖아요', '~인 셈이다' 같은 구어체/강의체 금지
- 과장 표현 절대 금지: "아무도 몰랐다", "놀랍게도", "세상이 뒤집어졌다", "혁명적인"
- 상투적 비유 금지: "마치 ~처럼"이 문단마다 나오면 안 됩니다
- 감정 조작 금지: 사실을 제시하고 독자가 스스로 판단하게 하세요

# 대상 독자
**${pc.audience}**

# 작성할 챕터 정보
**제목**: ${chapterTitle}
${partContext}
${timeConstraint}

# 챕터 개요
${outline || '개요 없음'}

# 참고자료
${refsText}

${docStructure}

# 글쓰기 핵심 원칙
- 이 챕터는 **교양서의 한 챕터**입니다. 교과서도 아니고 소설도 아닙니다.
- 구체적인 연도, 장소, 인물, 숫자로 시작하세요 — 과장이 아닌 사실로
- 개념은 이야기의 맥락 안에서 자연스럽게 설명하세요
- 인물의 실제 행적과 사건의 인과관계를 중심으로 전개하세요
- 비유는 개념 이해에 꼭 필요할 때만 간결하게 사용하세요
- 절제된 위트: 사실 자체의 아이러니로 충분합니다
- 다이어그램이 필요하면 Mermaid 코드블록 사용 (노드 내 줄바꿈은 반드시 <br/> 태그 사용)
- **이모지는 소제목에만 최소한으로 사용**하세요 (본문에는 쓰지 마세요)

${guidelinesText}
# 마크다운 형식으로 챕터를 작성해주세요.
분량 가이드를 준수하되, 정확성과 가독성이 최우선입니다.
${templateAddition}
`;
    }

    // ============================================================
    // 학교 교과서 전용 프롬프트 (일반 경로와 완전 분리)
    // ============================================================
    if (isTextbook) {
      return `당신은 ${pc.role}입니다.
한국 교육과정에 정합하는 검인정 교과서 수준의 챕터를 집필합니다.

# 핵심 철학
"${pc.philosophy}"
- ${pc.style}

# 대상 독자
**${pc.audience}**
- 해당 학년 수준의 어휘와 문장 난이도를 준수합니다
- 존대말("~입니다", "~합니다")을 사용합니다

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

# 교과서 작성 원칙

## 생각 열기 작성법
- 학생들이 일상에서 경험할 수 있는 현상이나 사진으로 시작하세요
- "왜 그럴까요?", "~를 관찰해 본 적이 있나요?" 식의 질문으로 호기심을 유발하세요
- 이 단원에서 배울 핵심 개념과 자연스럽게 연결되어야 합니다

## 탐구 활동 작성법
- 준비물, 과정, 결과 예측, 토의 질문을 빠짐없이 포함하세요
- 학생이 직접 수행할 수 있는 구체적이고 안전한 활동이어야 합니다
- 결과를 통해 핵심 개념을 스스로 발견할 수 있도록 설계하세요
- 탐구 결과와 핵심 개념 전개를 반드시 연결하세요 ("탐구에서 확인한 것처럼...")
- [실험 장치 그림] 또는 Mermaid 과정 순서도를 포함하세요

## 개념 전개 작성법
- **선수학습 확인 -> 핵심 개념 정의 -> 비유/예시 -> 원리 설명 -> 시각 자료** 순서로 전개하세요
- 어려운 용어는 처음 나올 때 괄호 안에 쉬운 풀이를 병기하세요
- 모든 핵심 개념에 Mermaid 다이어그램, [사진 설명], 또는 [그래프 설명]을 포함하세요

## 확인 문제 작성법
- **기본**(개념 확인, 2문항) -> **응용**(적용, 1~2문항) -> **심화**(사고력 서술형, 1문항) 3단계로 구성하세요
- <details> 태그로 정답을 숨겨두세요
- 심화 문제는 실생활 상황이나 탐구 결과를 해석하는 서술형으로 출제하세요

## 형식 규칙
- **톤앤매너**: ${pc.tone}
- **시각 자료**: 다이어그램은 반드시 Mermaid 코드블록 사용
- **그림 번호**: "[그림 1-1] 설명" 형식으로 명시
- **마크다운 테이블 금지**: 파이프(|)와 대시(-)로 만드는 표 절대 금지! 볼드+목록 또는 Mermaid로 대체
- **ASCII art 절대 금지**: 텍스트로 그림/도표/박스를 그리지 마세요
- **프로그래밍 코드 블록 금지** (Mermaid 제외)
- 이모지는 섹션 제목에만 최소한으로 사용하세요

${guidelinesText}
# 마크다운 형식으로 전체 챕터를 작성해주세요.
위 교과서 구조를 **반드시 모두** 포함하되, 분량 가이드를 철저히 준수하세요.
탐구 활동의 구체성과 개념 전개의 체계성이 최우선입니다.
${templateAddition}
`;
    }

    // ============================================================
    // 자기주도학습 전용 프롬프트 (일반 경로와 완전 분리)
    // ============================================================
    if (isSelfDirected) {
      return `당신은 ${pc.role}입니다.
혼자 공부하는 학습자가 이 챕터만 읽으면 선생님 없이도 완벽하게 이해하고 실습할 수 있도록 작성하세요.

# 핵심 철학
"${pc.philosophy}"
- ${pc.style}

# 대상 독자
**${pc.audience}**
- 이 분야를 처음 접하거나 기초부터 다시 배우고 싶은 학습자입니다
- 옆에 물어볼 사람이 없으므로, 모든 설명은 자기완결적이어야 합니다
- 어려운 부분에서 좌절하지 않도록 격려와 안전망이 필요합니다

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

# 자기주도 학습서 작성 핵심 원칙

## 자기완결성 (가장 중요!)
- 이 챕터만 읽으면 **선생님 없이** 해당 내용을 이해할 수 있어야 합니다
- 새로운 용어가 나오면 **즉시** 쉬운 말로 풀어쓰세요 + 왜 이런 이름을 쓰는지도 설명하세요
- "~라고 가정하겠습니다", "~는 이미 아실 텐데"와 같은 전제 금지! 모르면 설명하세요
- 매 실습 단계마다 "이 단계가 끝나면 ~가 보여야 해요"라는 확인 포인트를 넣으세요

## 학습자 친화성
- 설명 → 비유/예시 → 확인의 3단계 패턴을 반복하세요
- 어려운 개념은 "쉽게 말하면"으로 시작하는 한 줄 요약을 추가하세요
- "만약 여기서 이해가 안 된다면, ~만 기억하면 됩니다"라는 안전망을 제공하세요
- **매 개념 설명 뒤에 반드시** 🔍 체크포인트를 넣어 학습자가 자기 위치를 확인하게 하세요

## 동기 부여
- 챕터 시작 시 "이걸 배우면 ~할 수 있게 돼요!"로 기대감을 형성하세요
- 각 실습 성공 시 "잘하셨어요!", "축하해요!" 같은 즉각적 격려를 넣으세요
- 챕터 마무리 시 "오늘의 성취"로 배운 것을 한눈에 보여주세요
- "처음에는 누구나 어렵습니다", "천천히 해도 괜찮아요" 같은 안심 표현을 사용하세요

## FAQ & 트러블슈팅 (반드시 포함!)
- 학습자가 가장 많이 막히는 지점을 예측하여 FAQ를 작성하세요
- <details> 태그로 접이식 Q&A를 제공하세요
- "~가 안 돼요" → 원인 2-3가지 + 각각의 해결법
- "~가 헷갈려요" → 비유를 사용한 재설명

## 형식 규칙
- **톤앤매너**: ${pc.tone}
- **시각 자료**: 다이어그램은 반드시 Mermaid 코드블록 사용
- **마크다운 테이블 금지**: 파이프(|)와 대시(-)로 만드는 표 절대 금지! 볼드+목록으로 대체
- **ASCII art 절대 금지**: 텍스트로 그림/도표/박스를 그리지 마세요
- 이모지는 섹션 제목에 사용하고, 체크포인트/격려 메시지에서 적절히 활용하세요

${guidelinesText}
# 마크다운 형식으로 전체 챕터를 작성해주세요.
위 구조를 **반드시 모두** 포함하되, 분량 가이드를 철저히 준수하세요.
학습자가 혼자서도 절대 막히지 않는 친절한 안내가 최우선입니다.
${templateAddition}
`;
    }

    // ============================================================
    // 프로그래밍 전용 프롬프트 (일반 경로와 완전 분리)
    // ============================================================
    if (isProgramming) {
      return `당신은 ${pc.role}입니다.
같이 코딩하는 선배 개발자처럼, 학습자 옆에 앉아서 하나씩 알려주는 느낌으로 작성하세요.

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

# 프로그래밍 교육 콘텐츠 작성 원칙

## 코드 품질 원칙
- **실행 가능성 최우선**: 모든 코드는 복사해서 바로 실행 가능해야 합니다. import, 변수 선언 등 빠짐없이 포함하세요.
- **코드 블록에 언어 태그 필수**: 항상 python, javascript 등 명시
- **실행 결과를 반드시 보여주세요**: 코드 바로 아래에 예상 출력을 포함
- **주석은 "왜"에 집중**: 코드가 하는 일(what)이 아니라, 왜 이렇게 하는지(why)를 주석으로

## 교육 방법론 원칙
- **점진적 빌드업**: 완성 코드를 바로 보여주지 마세요! v1(기본) → v2(기능 추가) → v3(개선) → 최종 순서로 진화
- **에러 경험 설계**: 의도적으로 틀린 코드를 제시하고, 에러 메시지 전문을 보여준 뒤, 원인 분석 → 수정 코드 순서로 진행
- **개념-코드 매핑**: 추상 개념 설명 후 "위 코드의 N번째 줄 \`코드내용\`이 바로 [개념]입니다"처럼 줄 번호+코드 인용으로 연결. 코드 주석에도 # ← 여기가 [개념] 식으로 표시
- **연습 문제 3단계**: 기초(변형) → 응용(새 상황) → 도전(결합/설계), 각각 힌트+정답을 접힌 상태로

## 톤앤매너
- **톤**: ${pc.tone}
- 이모지 센스있게 활용 (소제목에 집중)
- 비유와 예시 충분 — 추상적 개념을 구체적으로
- "이건 나중에 배워요" 대신, 왜 지금은 다루지 않는지 한 줄 설명

## 형식 규칙
- **시각 자료**: 다이어그램은 반드시 Mermaid 코드블록 사용
- **마크다운 테이블 금지**: 파이프(|)와 대시(-)로 만드는 표 절대 사용 금지! 정보 요약은 볼드+목록으로
- **ASCII art 절대 금지**: 텍스트 문자로 그림/도표/박스를 그리지 마세요

${guidelinesText}
# 마크다운 형식으로 전체 챕터를 작성해주세요.
위 구조를 **반드시 모두** 포함하되, 분량 가이드를 철저히 준수하세요.
코드의 실행 가능성과 점진적 빌드업이 가장 중요합니다.
${templateAddition}
`;
    }

    // ============================================================
    // 일반 교육자료 프롬프트 (프로그래밍, 스토리텔링, 비즈니스 이외의 기본 경로)
    // ============================================================
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
- **실용적 내용**: 학습자가 실제로 활용할 수 있는 구체적 예시 제공
- **톤앤매너**: ${pc.tone}, 이모지 센스있게 활용
- **비유와 예시 충분**: 추상적 개념을 구체적으로
- **시각 자료**: 다이어그램은 반드시 Mermaid 코드블록 사용
- **마크다운 테이블 금지**: 파이프(|)와 대시(-)로 만드는 표(마크다운 테이블) 절대 사용 금지! 정보 요약은 볼드+목록, 개념 비교는 Mermaid로 표현
- **ASCII art 절대 금지**: 텍스트 문자로 그림/도표/박스를 그리지 마세요

${guidelinesText}
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
