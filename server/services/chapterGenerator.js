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
  'class-preview': {
    role: '경력 20년의 수업 설계 전문가이자 실습 중심 교육 콘텐츠 저자 — 교사가 이 자료만 보고 바로 수업할 수 있는 완성형 강의 자료를 만드는 전문가',
    audience: '교사 (이 자료를 읽고 바로 수업을 진행할 현장 교사)',
    philosophy: '수업은 미리 체험해야 잘 가르칠 수 있다 — 교사-학생 대화, 실습 코드, 예상 Q&A가 모두 담긴 수업 시뮬레이션 자료',
    style: '강의 스크립트(교사-학생 대화) + 단계별 실습 코드 + 인터랙티브 회로도 + 예상 Q&A + 수업 장면 시나리오 + 레벨별 도전과제',
    tone: '교사에게는 전문적이고 실용적인 톤, 스크립트 속 선생님은 친근하고 격려하는 톤, 학생 대사는 자연스러운 10대 말투',
  },
  'lesson-per-session': {
    role: '차시별 수업 설계 전문가이자 교과 교육 수석 교사 — 학습자가 핵심 개념을 체계적으로 학습할 수 있는 차시별 인터랙티브 교재를 만드는 전문가',
    audience: '학습자 (차시별 수업 교재 대상)',
    philosophy: '핵심 개념을 이해하고 비판적으로 사고하며 창의적으로 적용하는 역량 중심 교육',
    style: '수업 배너 → 카드 그리드 → Steps 수업 흐름 → 개념 설명(비유→정의→심화) → 토론/실습 → 평가(객관식+서술형+자기점검)',
    tone: '학생 친화적이고 흥미를 유발하되, 학술적 정확성을 갖춘 교과서 톤 — 존대말(~입니다/~합니다) 사용',
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

    // 참고자료 캐시 (배치 생성 시 재파싱 방지)
    this._referencesCache = null;
    this._referencesCacheKey = null;
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

    // v2: TemplateComposer로 조합 데이터 미리 로드
    if (this.templateInfo.version === 2) {
      try {
        const { TemplateComposer } = await import('./templateManager.js');
        const tc = new TemplateComposer();
        this._v2Composed = await tc.compose(
          this.templateInfo.what_id || '_default',
          this.templateInfo.how_id,
          this.templateInfo.features || [],
          this.templateInfo.context_answers || {},
        );
      } catch (e) {
        console.error('v2 템플릿 조합 실패, v1 폴백:', e.message);
        this._v2Composed = null;
      }
    }
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
      'claude-opus-4-7': { input: 5.0, output: 25.0 },
      'claude-opus-4-6': { input: 5.0, output: 25.0 },
      'claude-opus-4-5-20251101': { input: 5.0, output: 25.0 },
      'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
      'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0 },
      'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
      'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
    };
    // 모델별 max_output_tokens 캐시 초기화
    this._modelMaxTokens = {};
    if (!existsSync(configPath)) {
      return fallback;
    }
    try {
      const config = JSON.parse(await readFile(configPath, 'utf-8'));
      // fallback과 병합하여 알려진 모델은 항상 정확한 가격 보장
      const pricing = { ...fallback };
      for (const m of config.models || []) {
        pricing[m.id] = m.pricing || this._inferPricing(m.id, fallback);
        // max_output_tokens 필드가 있으면 캐시에 저장
        if (typeof m.max_output_tokens === 'number' && m.max_output_tokens > 0) {
          this._modelMaxTokens[m.id] = m.max_output_tokens;
        }
      }
      return pricing;
    } catch {
      return fallback;
    }
  }

  /**
   * 모델별 안전한 출력 토큰 상한 조회
   * model_config.json의 max_output_tokens × 0.95 (스트리밍 버퍼 여유)
   * 모르는 모델은 보수적으로 32000 반환
   */
  _getModelTokenLimit(modelId) {
    const declared = (this._modelMaxTokens && this._modelMaxTokens[modelId]) || 0;
    if (declared > 0) {
      return Math.floor(declared * 0.95);
    }
    // 모델 ID 패턴으로 추론 (config에 없는 신규 모델)
    const id = (modelId || '').toLowerCase();
    if (id.includes('opus-4-7')) return 39900; // 42000 * 0.95
    if (id.includes('opus')) return 30400;      // 32000 * 0.95
    if (id.includes('sonnet') || id.includes('haiku')) return 60800; // 64000 * 0.95
    if (id.startsWith('gpt-5') || id.startsWith('gpt-4') || id.startsWith('o')) return 121600; // 128000 * 0.95
    if (id.startsWith('gemini')) return 62259;  // 65536 * 0.95
    if (id.startsWith('solar')) return 7782;    // 8192 * 0.95
    return 32000;
  }

  /** 모델 ID에서 가격 추론 (config에 pricing이 없을 때) */
  _inferPricing(modelId, fallback) {
    const id = modelId.toLowerCase();
    if (id.includes('opus')) return fallback['claude-opus-4-7'] || { input: 5.0, output: 25.0 };
    if (id.includes('haiku')) return fallback['claude-haiku-4-5-20251001'] || { input: 0.8, output: 4.0 };
    if (id.includes('sonnet')) return { input: 3.0, output: 15.0 };
    if (id.startsWith('gpt-4o')) return { input: 2.5, output: 10.0 };
    if (id.startsWith('gpt-4')) return { input: 10.0, output: 30.0 };
    if (id.startsWith('o')) return { input: 15.0, output: 60.0 };
    if (id.startsWith('gemini')) return { input: 1.25, output: 5.0 };
    if (id.startsWith('solar')) return { input: 2.0, output: 6.0 };
    return { input: 3.0, output: 15.0 };
  }

  _getPromptConfig() {
    // v2: TemplateComposer에서 조합된 페르소나 사용
    if (this.templateInfo.version === 2 && this._v2Composed) {
      const pc = { ...this._v2Composed.persona };
      if (this.projectConfig.target_audience) {
        pc.audience = this.projectConfig.target_audience;
      }
      return pc;
    }

    // v1: 기존 TEMPLATE_PROMPTS 사용
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

  _calcMaxTokensForTime(timeMinutes, userMaxTokens, modelId = null) {
    // ============================================================
    // 분량 제어 핵심 원칙: "잘리지 않는 것이 최우선"
    //
    // 1. 프롬프트에서 분량 가이드(charMin~safeCharMax)로 AI에게 적정 분량을 요청
    // 2. max_tokens는 AI가 가이드를 약간 초과해도 잘리지 않도록 충분한 여유를 둠
    // 3. AI가 프롬프트 가이드를 잘 따르면 charMax 이내에서 자연스럽게 끝남
    // 4. 만약 AI가 가이드를 무시하고 길게 써도 max_tokens 한도 내에서 마무리됨
    //
    // MODEL_TOKEN_LIMIT는 model_config.json의 max_output_tokens에서 동적으로 조회
    // (하드코딩 제거 — 새 모델이 나와도 model_config.json만 수정하면 됨)
    // ============================================================
    const MODEL_TOKEN_LIMIT = this._getModelTokenLimit(modelId);
    const effectiveMinutes = timeMinutes > 0 ? timeMinutes : 50;

    // 프롬프트의 charMax (AI에게 요청하는 최대 글자 수)
    const charMax = effectiveMinutes * 500;

    // max_tokens는 charMax의 2배로 설정 — 충분한 여유
    // → AI가 가이드를 따르면 charMax 이내에서 끝남 (잘림 없음)
    // → AI가 가이드를 초과해도 2배까지는 잘리지 않음
    // → 실제 잘림은 MODEL_TOKEN_LIMIT에서만 발생
    const timeCap = Math.max(6000, Math.round(charMax * 2.0));

    // 사용자가 명시적으로 max_tokens를 설정한 경우 → 사용자 설정 우선 (timeCap 무시)
    // 설정하지 않은 경우(0) → 시간 기반 자동 계산 사용
    if (userMaxTokens > 0) {
      return Math.min(userMaxTokens, MODEL_TOKEN_LIMIT);
    }
    return Math.min(timeCap, MODEL_TOKEN_LIMIT);
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
   *
   * stopReason === 'max_tokens'로 잘릴 경우:
   *   1) 마지막 완전한 문장까지 트리밍
   *   2) 자동으로 continuation 호출 (assistant 메시지 + "이어서" 요청)
   *   3) 최대 MAX_CONTINUATIONS회 반복
   *   4) 모든 결과를 합쳐 반환 (input/output 토큰도 누적)
   * 헌법 제3조(완결성) 보장 — 더 이상 사용자가 별도 세션에서 수동 보정할 필요 없음.
   */
  async _streamGenerate(model, maxTokens, prompt, chapterId, progressCallback, isRetry = false) {
    const MAX_CONTINUATIONS = 2; // 초기 1회 + 이어쓰기 최대 2회 = 총 3 chunk
    const provider = detectProvider(model);
    const apiKey = resolveApiKey(provider, this.apiKeys);
    const prefix = isRetry ? '재시도 ' : '';

    const messages = [{ role: 'user', content: prompt }];
    let combinedContent = '';
    let totalInput = 0;
    let totalOutput = 0;
    let lastStopReason = '';

    for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
      const isContinuation = attempt > 0;
      const estimatedTotalChars = maxTokens;
      let charsSoFar = 0;
      let lastProgressTime = Date.now();
      const labelPrefix = isContinuation ? `${prefix}이어쓰기 ${attempt}/${MAX_CONTINUATIONS} ` : `${prefix}`;

      if (isContinuation && progressCallback) {
        progressCallback(`🔁 ${chapterId} 잘림 감지 → 자동 이어쓰기 ${attempt}/${MAX_CONTINUATIONS} 시작...`);
      }

      const result = await streamChat({
        provider, apiKey, model,
        messages,
        maxTokens,
        onText: (text) => {
          charsSoFar += text.length;
          const now = Date.now();
          if (now - lastProgressTime >= 3000 && progressCallback) {
            const pct = Math.min(99, Math.round((charsSoFar / estimatedTotalChars) * 100));
            const totalLen = combinedContent.length + charsSoFar;
            progressCallback(`📝 ${chapterId} ${labelPrefix}생성 중... 누적 ${totalLen.toLocaleString()}자 (현재 ${charsSoFar.toLocaleString()}, ~${pct}%)`);
            lastProgressTime = now;
          }
        },
      });

      totalInput += result.inputTokens || 0;
      totalOutput += result.outputTokens || 0;
      lastStopReason = result.stopReason;

      // 마지막 시도 또는 정상 종료 → 결합
      if (result.stopReason !== 'max_tokens' || attempt === MAX_CONTINUATIONS) {
        if (result.stopReason === 'max_tokens') {
          // 마지막 시도에서도 잘렸으면 트리밍
          this._log(`⚠️ ${chapterId} 최종 시도(${attempt})에서도 max_tokens 도달 — 마지막 완전 문장까지 트리밍`);
          combinedContent += this._trimToLastCompleteSentence(result.content);
          if (progressCallback) {
            progressCallback(`⚠️ ${chapterId} ${MAX_CONTINUATIONS + 1}회 시도 후 트리밍 완료 (${combinedContent.length.toLocaleString()}자)`);
          }
        } else {
          combinedContent += result.content;
        }
        break;
      }

      // 잘렸지만 더 시도할 여지 있음 → 트리밍 후 continuation 메시지 구성
      const trimmed = this._trimToLastCompleteSentence(result.content);
      combinedContent += trimmed;

      this._log(`🔁 ${chapterId} 이어쓰기 트리거 [attempt=${attempt + 1}] — 누적 ${combinedContent.length}자 (이번 chunk ${trimmed.length}자)`);

      // 마지막 ~1500자를 컨텍스트로 노출하면서 전체 누적 본문을 assistant 응답으로 전달
      const tailContext = combinedContent.slice(-1500);
      messages.push({ role: 'assistant', content: combinedContent });
      messages.push({
        role: 'user',
        content:
          `위에서 응답이 토큰 한도로 잘렸습니다. 같은 톤·구조·형식으로 그대로 이어서 작성하세요.\n\n` +
          `# 이어쓰기 규칙\n` +
          `- 헤더(##)를 다시 시작하지 말고, 끊긴 문장/문단/섹션부터 자연스럽게 이어가세요.\n` +
          `- 이미 작성한 내용을 다시 요약하거나 반복하지 마세요.\n` +
          `- "이어서…", "계속하면…" 같은 메타 문장 없이 본문 흐름 그대로 시작하세요.\n` +
          `- 가능하면 이번 chunk 안에서 챕터를 완결(성찰/정리 섹션 포함)하세요.\n\n` +
          `# 직전 본문 끝부분 (참고)\n` +
          `\`\`\`\n${tailContext}\n\`\`\``,
      });
    }

    return {
      content: this._sanitizeContent(combinedContent),
      inputTokens: totalInput,
      outputTokens: totalOutput,
      stopReason: lastStopReason,
    };
  }

  /**
   * max_tokens로 잘린 콘텐츠를 마지막 완전한 문장/줄까지 트리밍
   * 열린 코드블록도 닫아줌
   */
  _trimToLastCompleteSentence(content) {
    if (!content) return content;

    // 열린 코드블록 감지 및 닫기
    const codeBlockOpens = (content.match(/```/g) || []).length;
    if (codeBlockOpens % 2 !== 0) {
      // 마지막 열린 코드블록의 시작점을 찾아 그 전까지만 유지
      const lastOpen = content.lastIndexOf('```');
      const beforeBlock = content.substring(0, lastOpen).trimEnd();
      if (beforeBlock.length > content.length * 0.5) {
        content = beforeBlock;
      } else {
        // 코드블록이 본문의 절반 이상이면 닫기만 추가
        content = content.trimEnd() + '\n```';
      }
    }

    // 줄 단위로 나누어 마지막 완전한 줄 찾기
    const lines = content.split('\n');
    // 마지막 줄이 불완전하면 제거
    while (lines.length > 1) {
      const lastLine = lines[lines.length - 1].trim();
      if (!lastLine) { lines.pop(); continue; }
      // 문장 종결 부호로 끝나거나, 마크다운 헤더, 빈 줄, 목록 등이면 OK
      const endsWell = /[.?!)\]}>。？！）」】`'"]$/.test(lastLine)
        || /^#{1,6}\s/.test(lastLine) // 헤더
        || /^[-*+]\s/.test(lastLine)  // 목록
        || /^```/.test(lastLine)      // 코드블록 경계
        || /^\d+\./.test(lastLine);   // 번호 목록
      if (endsWell) break;
      lines.pop();
    }

    return lines.join('\n').trimEnd();
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

  /**
   * 참고자료 폴더의 현재 상태(파일명+크기+mtime)를 기반으로 캐시 키를 계산.
   * 배치 생성 중 파일이 바뀌지 않으면 재파싱 없이 캐시 사용.
   */
  async _computeReferencesCacheKey() {
    if (!existsSync(this.referencesPath)) return 'empty';
    try {
      const { readdir, stat } = await import('fs/promises');
      const entries = await readdir(this.referencesPath);
      const parts = [];
      for (const name of entries.sort()) {
        if (name.startsWith('.')) continue;
        try {
          const s = await stat(join(this.referencesPath, name));
          if (s.isFile()) parts.push(`${name}:${s.size}:${s.mtimeMs}`);
        } catch { /* skip */ }
      }
      return parts.join('|') || 'empty';
    } catch {
      return 'error';
    }
  }

  async _loadReferences() {
    if (!existsSync(this.referencesPath)) return [];

    // 캐시 체크 — 동일 세션 내 배치 생성에서 재파싱 방지
    const cacheKey = await this._computeReferencesCacheKey();
    if (this._referencesCache && this._referencesCacheKey === cacheKey) {
      return this._referencesCache;
    }

    // ReferenceManager를 사용하여 모든 포맷을 병렬 파싱
    const { ReferenceManager } = await import('./referenceManager.js');
    const rm = new ReferenceManager(this.projectPath);
    const parsed = await rm.loadAllParsed({ concurrency: 4 });
    const refs = [];

    for (const r of parsed) {
      if (r.status === 'ok' && r.content) {
        refs.push(`[${r.name}]\n${r.content}`);
      } else if (r.status === 'parse_error') {
        console.warn(`참고자료 파싱 실패 (${r.name}): ${r.error || '알 수 없는 오류'}`);
      }
    }

    this._referencesCache = refs;
    this._referencesCacheKey = cacheKey;
    return refs;
  }

  /**
   * 긴 참고자료를 챕터 관련 구간으로 슬라이싱해 토큰을 절약한다.
   * - 임계 길이 이하: 그대로 반환
   * - 초과: 문단 단위로 분할 → 챕터 키워드와 매칭되는 상위 문단만 추출
   */
  _sliceReferenceForChapter(ref, searchTerms, maxChars = 8000) {
    if (!ref || ref.length <= maxChars) return ref;
    if (!searchTerms || searchTerms.size === 0) return ref.slice(0, maxChars) + '\n\n...(이하 생략)';

    // 헤더 추출: "[파일명]\n" 유지
    const headerMatch = ref.match(/^\[[^\]]+\]\n/);
    const header = headerMatch ? headerMatch[0] : '';
    const body = header ? ref.slice(header.length) : ref;

    // 문단 분할 (빈 줄 기준)
    const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    if (paragraphs.length <= 1) {
      return header + body.slice(0, maxChars) + '\n\n...(이하 생략)';
    }

    // 문단별 점수 매기기
    const scored = paragraphs.map((p, idx) => {
      const lower = p.toLowerCase();
      let score = 0;
      for (const term of searchTerms) {
        if (lower.includes(term)) score += 1;
      }
      return { idx, score, text: p };
    });

    // 점수 내림차순 → 원래 순서 유지하며 한도까지 채움
    const sorted = [...scored].sort((a, b) => b.score - a.score || a.idx - b.idx);
    const picked = new Set();
    let total = 0;
    for (const s of sorted) {
      if (total + s.text.length > maxChars) continue;
      picked.add(s.idx);
      total += s.text.length;
      if (total >= maxChars * 0.9) break;
    }

    // 원래 순서대로 재조립
    const selected = scored.filter((s) => picked.has(s.idx)).map((s) => s.text);
    if (selected.length === 0) return header + body.slice(0, maxChars) + '\n\n...(이하 생략)';

    return header + selected.join('\n\n') + '\n\n...(관련도 낮은 구간 생략됨)';
  }

  _extractSearchTerms(chapterTitle, outline, partContext) {
    const terms = new Set();
    for (const text of [chapterTitle, partContext, (outline || '').slice(0, 1000)]) {
      if (!text) continue;
      const words = String(text).replace(/[,.:*\-_#\[\]"'()]/g, ' ').split(/\s+/);
      for (const word of words) {
        const clean = word.trim();
        if (clean.length >= 2) terms.add(clean.toLowerCase());
      }
    }
    return terms;
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

  /**
   * 모든 system prompt 끝에 통합 출력 형식 규칙을 덧붙인다.
   * 각 템플릿마다 흩어진 "ASCII art 절대 금지" 규정을 보강하고,
   * 워크시트/치트시트도 마크다운 표로 통일하도록 한다.
   *
   * 추가되는 규칙은 헌법 제7조(보이면 이해된다)에 부합하도록
   * - 회로도/도표/박스/워크시트 프레임 모두 ASCII 금지
   * - 인쇄용 워크시트는 마크다운 표(파이프+대시)로 작성
   * - 시각화는 Mermaid/SVG/마크다운 표로 일관
   */
  _appendUnifiedOutputRules(prompt) {
    const SUFFIX = `

# 🧱 출력 형식 통합 규칙 (모든 챕터 공통, 최우선 준수)

아래 규칙은 어떤 템플릿이든 일관되게 적용됩니다. 위 지시와 충돌하면 이 규칙을 따르세요.

1. **ASCII 박스/도표/프레임 일체 금지** — 텍스트 문자(┌ ─ ┐ │ └ ┘ ┼ 등)로 그림·도표·박스·워크시트 프레임·치트시트·핀배치·회로도를 그리지 마세요.
2. **워크시트·치트시트·기록 양식도 마크다운 표로 작성하세요.** 예를 들어 "실패 기록 양식", "수용 기준 체크리스트", "관찰 기록지", "도형 치트시트" 같은 학생 활동지·교사 인쇄물도 모두 다음과 같이 마크다운 표로 만드세요:

   \`\`\`markdown
   | 항목 | 학생 기록 |
   |---|---|
   | 내가 한 말 |  |
   | 봇이 한 말 |  |
   | 뭐가 이상한가 |  |
   | 추가할 규칙 |  |
   \`\`\`

   빈칸은 셀을 비워 두면 됩니다. ASCII 박스보다 표가 인쇄·복사·렌더링 모두 깔끔합니다.
3. **데이터/비교/대조/타임라인은 항상 마크다운 표를 우선** 고려하세요. 표로 표현 가능한 것을 굳이 글로 풀어 쓰지 마세요.
4. **시각화는 Mermaid → 인라인 SVG → 마크다운 표** 순으로 선택하세요. 시각 자료가 필요 없는 콘텐츠라면 억지로 넣지 마세요.
5. **체크박스 양식**은 \`- [ ] 항목\` 마크다운 문법을 사용하세요. ASCII 체크박스(□, ☐) 대신 마크다운 체크리스트.
`;
    if (!prompt) return prompt;
    return prompt + SUFFIX;
  }

  /**
   * 템플릿 문자열의 {{변수}}를 실제 값으로 치환
   */
  _substituteVars(template, vars) {
    let result = template;

    // 조건부 블록 처리: {{#if_KEY}}...{{/if_KEY}}
    // context_answers 기반으로 시뮬레이션/역량평가 조건 해석
    const contextAnswers = this.templateInfo?.context_answers || {};
    const teachingStyle = contextAnswers.teaching_style || '';
    const condMap = {
      if_simulation: ['시뮬레이션형', '통합형'].includes(teachingStyle),
      if_competency: ['역량평가형', '통합형'].includes(teachingStyle),
    };
    for (const [condKey, show] of Object.entries(condMap)) {
      const regex = new RegExp(`\\{\\{#${condKey}\\}\\}([\\s\\S]*?)\\{\\{/${condKey}\\}\\}`, 'g');
      result = result.replace(regex, show ? '$1' : '');
    }

    // context_answers를 vars에 추가 (teaching_style 등)
    for (const [key, value] of Object.entries(contextAnswers)) {
      if (!(key in vars)) {
        vars[key] = value;
      }
    }

    // 변수 치환: {{key}} → value
    for (const [key, value] of Object.entries(vars)) {
      result = result.replaceAll(`{{${key}}}`, String(value ?? ''));
    }
    return result;
  }

  async _buildPrompt(chapterId, chapterTitle, outline, references, partContext, maxTokens, estimatedTime, totalChapters, currentNum) {
    const BASE_PROMPT_TOKENS = 2500;
    const MAX_CONTEXT_TOKENS = 150000;
    const availableInputTokens = MAX_CONTEXT_TOKENS - maxTokens - BASE_PROMPT_TOKENS;

    references = this._sortReferencesByRelevance(references, chapterTitle, outline, partContext);

    // 긴 참고자료는 챕터 관련 구간으로 슬라이싱해 토큰 절약
    const LONG_REF_THRESHOLD = 8000; // 문자 단위
    const hasLongRef = references.some((r) => r.length > LONG_REF_THRESHOLD);
    if (hasLongRef) {
      const searchTerms = this._extractSearchTerms(chapterTitle, outline, partContext);
      references = references.map((ref) =>
        ref.length > LONG_REF_THRESHOLD
          ? this._sliceReferenceForChapter(ref, searchTerms, LONG_REF_THRESHOLD)
          : ref
      );
    }

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

    // v2: 교사가 설정한 교육 맥락 (context_answers → 프롬프트 직접 주입)
    let pedagogicalContext = '';
    if (this.templateInfo?.pedagogical_context) {
      pedagogicalContext = `\n${this.templateInfo.pedagogical_context}\n`;
    }

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
      // 분량 계산: 프롬프트 가이드용
      // 의도: charMax는 "콘텐츠 목표치"이며 모델 토큰 한도를 단일 chunk가 넘지 않도록 보정.
      // 모델 한도를 초과하는 분량은 _streamGenerate의 자동 continuation이 처리하므로
      // 한 chunk가 한도를 넘지 않게만 가이드한다.
      const rawCharMin = effectiveMinutes * 300;
      const rawCharMax = effectiveMinutes * 500;
      const modelTokenLimit = this._getModelTokenLimit(this.projectConfig.claude_model || null);
      // 한국어 ~1자/토큰 가정 + 안전마진(headroom 0.85)
      const singleChunkCap = Math.max(4000, Math.round(modelTokenLimit * 0.85));
      const charMin = Math.min(rawCharMin, singleChunkCap);
      const charMax = Math.min(rawCharMax, singleChunkCap);
      const safeCharMax = Math.round(charMax * 0.9); // 90% 지점에서 마무리 유도
      const conceptCount = Math.max(1, Math.min(4, Math.floor(effectiveMinutes / 20)));
      const stepCount = Math.max(2, Math.min(6, Math.floor(effectiveMinutes / 10)));

      timeConstraint = `
# ⏱️ 학습 시간 제약 (최우선 준수사항!)
**이 챕터의 목표 학습 시간: ${effectiveTimeLabel}**
${courseInfo}

## 분량 가이드 (${effectiveTimeLabel} 기준)
- **목표 글자 수: 약 ${charMin.toLocaleString()}~${safeCharMax.toLocaleString()}자**
- 핵심 개념: ${conceptCount}개에 집중
- 따라하기 실습: ${stepCount}단계 이내
- 예시/예제: 핵심만 포함, 부가 설명 최소화

## ⚠️ 분량 안내
- 이것은 ${effectiveTimeLabel} 수업 **한 차시** 분량입니다 (전체 교재가 아님!)
- **내용은 충실하게** 작성하되, ${safeCharMax.toLocaleString()}자 부근을 목표로 하세요
- 핵심 개념을 깊이 있게 다루면서도, 한 차시에 맞는 범위를 유지하세요
- **반드시 마무리 섹션(성찰/정리)까지 포함하여 완결된 형태로 끝내세요**

## 🎯 밀도 규칙 (장황함 방지)
좋은 교재는 **짧고 밀도 높은 문장**으로 핵심을 전달합니다. 아래 원칙을 반드시 지키세요:

1. **같은 개념을 반복해서 풀어 쓰지 말 것.** 비유·정의·사례 중 1~2개면 충분합니다. 세 번 이상 같은 이야기를 다른 말로 하지 마세요.
2. **불필요한 서두·중간 요약·예고 금지.**
   - ❌ "이 장에서는 ~를 배웁니다" (이미 제목과 학습목표에 있음)
   - ❌ "지금까지 ~를 살펴봤습니다" (바로 아래 섹션으로 넘어가면 됨)
   - ❌ "다음 섹션에서는 ~를 다룰 것입니다" (그냥 다루면 됨)
3. **한 문장에 하나의 개념.** 만연체 금지. 끊어 쓰세요.
4. **예시 개수는 최소로.** 2개로 충분한 설명에 5개를 나열하지 마세요.
5. **박스/인용/표는 강조가 필요한 곳에만.** 분량 채우기용으로 남발하지 마세요.
6. **분량 부족 시 덜 중요한 항목을 생략.** 문장이 중간에 끊기는 것보다 한 섹션이 빠지는 게 낫습니다.
7. **핵심을 먼저, 부연은 나중에.** "하지만…", "단, …", "참고로…" 같은 부연은 최소한만.

## ✏️ Markdown 문법 안전 규칙 (렌더링 깨짐 방지)

생성되는 Markdown이 HTML로 렌더될 때 문법 충돌로 깨지는 것을 막기 위해, 아래를 반드시 지키세요.

1. **숫자 범위 표기는 하이픈(-) 또는 "에서" 사용.** 절대 틸드(~) 금지.
   - ❌ \`15~19점\`, \`1~2개\`, \`3~5분\` (GFM 파서가 \`~...~\`를 취소선으로 해석 → "19점: 1" 같은 부분이 취소선으로 렌더됨)
   - ✅ \`15-19점\`, \`1-2개\`, \`3-5분\`, 또는 "15점에서 19점"
2. **의도적 취소선이 아니면 \`~~\`(이중 틸드) 사용 금지.** 음악 음표 표기 등 예외 상황에도 코드 블록 안에 넣으세요.
3. **밑줄 \`_\` 도 두 번 인접하면 기울임으로 해석됨.** 플레이스홀더는 \`________\` 대신 \`______\` (짝수 개) 또는 "(  )" 사용.
4. **볼드 \`**X**\` 안에 다시 \`**\`를 쓰지 말 것.** 중첩은 파서가 깨뜨립니다.
5. **HTML 태그를 쓰려면 양 끝이 정확히 맞아야 함.** \`<details><summary>...</summary>...</details>\`처럼 짝이 틀리면 페이지 전체 렌더가 틀어집니다.
6. **파이프(\`|\`)가 본문에 있으면 Markdown 표로 오해됨.** 본문에서 "컬럼 A | 컬럼 B" 같은 표현은 "컬럼 A, 컬럼 B"로 바꾸거나 코드 블록에 넣으세요.

## 🏫 교단 즉시성 규칙 (교사용 지도서 스타일의 경우 필수)

이 자료가 **교사용 지도서(차시별 수업안)**이거나 **Step 단위 수업 진행**이 필요한 경우, 아래 규칙을 반드시 지켜 "교단에서 바로 읽을 수 있는" 상태로 작성하세요.

### A. Step 구조 & 시간 명시
- 각 Step 제목에 **반드시 "(N분)" 형태로 시간 명시**. 예: \`### Step 2: 환경 세팅 (15분)\`
- 한 차시(50분)를 **Step 3~4개**로 분해하고, 각 Step 시간 합계가 차시 시간과 정확히 일치하도록 하세요
- 차시가 2교시 이상이면 **차시별로 Step 섹션을 분리**(예: \`### 차시 1 (50분)\` → Step 1~4, \`### 차시 2 (50분)\` → Step 1~4)

### B. 교단 발화 스크립트 (대사 규칙)
- **모든 선생님 대사는 인용블록 \`>\` 로 작성**하고, **한 블록은 3~4줄 이내**로 끊으세요
- 대사 블록 안에서는 **학생에게 바로 말할 수 있는 짧은 문장**만 쓰세요. 긴 설명·배경·이론은 \`>\` 블록 밖의 본문 산문으로 분리하세요
- 한 Step당 교단 발화 블록 **2회 이상** 등장 (도입 대사 + 활동 지시 대사)
- 만연체 절대 금지. 한 문장 = 하나의 메시지

좋은 예시:
\`\`\`
> "자, 여러분 화면 봐주세요.
> 제가 어제 만든 급식 봇이에요.
> 질문할 테니까 잘 보세요."
\`\`\`

나쁜 예시 (절대 금지 — 한 블록이 5줄 넘거나 이론 설명):
\`\`\`
> "이 봇은 의도적으로 부실하게 설계되어 있으며, 규칙이 단 한 줄만 들어 있기 때문에 제가 질문을 던지면 환각, 일관성 부족, 역할 이탈이라는 세 가지 대표적 실패 유형이 순차적으로 드러날 것입니다..."
\`\`\`

### C. 메타 해설 반복 금지 (4.7 과잉 패턴 방지)
- **"이 활동의 의도"는 각 Step당 2~3문장 이내.** 동일한 메타 해설을 챕터 전체에서 반복하지 마세요
- "이 차시의 본질", "설계 철학", "선생님께 드리는 편지" 같은 **편지·서문은 '왜 이걸 배우나요?' 섹션 1회에만** 등장. 이후 섹션에서 재등장 금지
- **인용된 명언·씨앗 문장·핵심 표어는 본문에 정확히 1회만** 등장. "미리 외워두세요"·"나중에 다시 물어볼게요" 같은 예고성 반복 금지
- **개념 설명은 개념당 2문단 완결** (비유 1문단 + 정의 또는 예시 1문단). 4단(비유+정의+예시+확인) 모두 구사하지 말 것
- **이미 본문에 등장한 인용·예시·표는 다른 섹션에서 재인용 금지**

### D. Step 구성 요소 (각 Step이 갖춰야 할 것)
교단에서 바로 쓸 수 있으려면 각 Step은 다음을 모두 포함하세요:
1. **이 활동의 의도** (2~3문장, 짧게)
2. **선생님 스크립트** (\`>\` 인용블록, 3~4줄 이내 × 2회 이상)
3. **예상 학생 반응 & 교사 대응 표** (3행 이상)
4. **교사 유의사항 또는 트러블슈팅** (불릿 또는 마크다운 표)

### E. 시각 자료 상한 (인지 부하 관리)
- Mermaid 다이어그램은 차시당 **1~2개**. 3개 이상 금지
- SVG/HTML 다이어그램은 사용 금지 (Mermaid 또는 마크다운 표만)
- **ASCII 박스(┌─┐, │, └─┘)는 사용 금지.** 대신 아래 대체 수단을 사용하세요:
  - 개념 강조·정의 박스 → **인용블록(\`>\` + **굵게**)** 또는 **Markdown 표**
  - 수식·공식 정리 → **Markdown 표 또는 순서 있는 리스트**
  - 치트시트·비교표 → **Markdown 표 (\\| 컬럼 구분)**
  - 학생 배포용 워크시트 빈 칸 → **Markdown 체크리스트(\`- [ ]\`)** 또는 밑줄(\`_______\`)을 포함한 인용 블록
- **이유**: ASCII 박스는 한글·영문·이모지가 섞이면 웹 브라우저에서 글자 폭 차이로 세로선이 어긋나 보입니다. 대신 위 대체 수단을 쓰면 디자인이 깔끔하게 유지됩니다.

### F. 학생 인지 부하 관리
- 한 Step 안에 새로 등장하는 개념 **최대 2개**
- **학생 활동 분량 > 교사 설명 분량** (따라하기 섹션의 글자 수 합계가 핵심 개념 섹션보다 많아야 함)
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
    const isClassPreview = templateId === 'class-preview';
    const isAiLiteracy = templateId === 'lesson-per-session';

    // 평가 단계 가이드 (assessment_level: 0~4)
    const assessmentLevel = this.projectConfig.assessment_level ?? 2;
    let assessmentGuide = '';
    if (assessmentLevel === 0) {
      assessmentGuide = '\n## 평가\n이 챕터에는 평가 섹션을 포함하지 마세요. 학습 내용만 제공합니다.\n';
    } else if (assessmentLevel === 1) {
      assessmentGuide = `
## 평가 (자기점검)
챕터 끝에 자기점검 체크리스트만 포함하세요:
\`\`\`markdown
## 자기점검
- [ ] 학습목표 1을 이해했나요?
- [ ] 학습목표 2를 설명할 수 있나요?
- [ ] 핵심 개념을 자신의 말로 정리할 수 있나요?
\`\`\`
`;
    } else if (assessmentLevel === 2) {
      assessmentGuide = `
## 평가 (확인 문제)
챕터 끝에 확인 문제를 포함하세요:
- 객관식 2~3문제 + 서술형 1문제
- 정답은 <details><summary>정답 확인</summary>정답 내용</details>으로 숨기세요
`;
    } else if (assessmentLevel === 3) {
      assessmentGuide = `
## 평가 (형성 평가)
챕터 끝에 형성 평가를 포함하세요:
- 객관식 2~3문제 (난이도 표시: ★ 기본, ★★ 심화)
- 서술형 1~2문제
- 정답은 <details><summary>정답 확인</summary>정답 내용</details>으로 숨기세요
- 자기점검 체크리스트도 포함
`;
    } else if (assessmentLevel === 4) {
      assessmentGuide = `
## 평가 (인터랙티브)
챕터 끝에 인터랙티브 퀴즈를 포함하세요. 반드시 아래 HTML 형식을 사용하세요:

\`\`\`html
<div class="ef-quiz" data-quiz-id="q1">
  <p class="ef-quiz-question">질문 텍스트</p>
  <div class="ef-quiz-options">
    <label class="ef-quiz-option" data-correct="true">
      <input type="radio" name="q1"> <span>정답 선택지</span>
    </label>
    <label class="ef-quiz-option">
      <input type="radio" name="q1"> <span>오답 선택지 1</span>
    </label>
    <label class="ef-quiz-option">
      <input type="radio" name="q1"> <span>오답 선택지 2</span>
    </label>
    <label class="ef-quiz-option">
      <input type="radio" name="q1"> <span>오답 선택지 3</span>
    </label>
  </div>
  <div class="ef-quiz-feedback" data-correct="정답 해설" data-wrong="오답 해설"></div>
</div>
\`\`\`

- 객관식 3~4문제를 위 HTML 형식으로 작성 (data-quiz-id는 q1, q2, q3... 순서)
- 정답 선택지에만 data-correct="true" 속성을 넣으세요
- 각 문제의 name 속성이 고유해야 합니다 (q1, q2, q3...)
- 서술형 1문제도 별도 추가 (일반 마크다운으로)
`;
    }

    // === JSON 기반 프롬프트 빌더 (v1 레거시 + v2 3축 조합) ===
    // 변수 맵 구성 (v2 슬롯 포함)
    const vars = {
      effectiveTimeLabel,
      effectiveMinutes: String(effectiveMinutes),
      chapterId,
      chapterTitle,
      partContext: partContext || '',
      timeConstraint,
      refsText,
      guidelinesText,
      templateAddition,
      pedagogicalContext,
      assessmentGuide,
      outline: outline || '개요 없음',
      'pc.role': pc.role,
      'pc.audience': pc.audience,
      'pc.philosophy': pc.philosophy,
      'pc.style': pc.style,
      'pc.tone': pc.tone,
    };

    // v2: _v2Composed에서 contentRules, featureBlocks, deliveryRules 추가
    if (this._v2Composed) {
      vars.contentRules = this._v2Composed.contentRules || '';
      vars.featureBlocks = this._v2Composed.featureBlocks || '';
      vars.deliveryRules = this._v2Composed.deliveryRules || '';
    }

    // 1. 템플릿 데이터 로드 — v2는 _v2Composed에서, v1은 JSON 파일에서
    let template;
    if (this.templateInfo.version === 2 && this._v2Composed) {
      // v2: TemplateComposer가 조합한 how 템플릿 데이터 사용
      template = {
        system_prompt_template: this._v2Composed.systemPromptTemplate,
        doc_structure: this._v2Composed.docStructure,
      };
    } else {
      template = await tm.getTemplate(templateId);
    }

    // 2. docStructure 로드 + 치환
    let docStructure;
    if (template?.doc_structure) {
      const rawDoc = (isCompact && template.doc_structure.compact)
        ? template.doc_structure.compact
        : template.doc_structure.standard;
      docStructure = rawDoc ? this._substituteVars(rawDoc, vars) : '';
    }

    // 3. docStructure를 vars에 추가
    vars.docStructure = docStructure || '';

    // 4. system_prompt 로드 + 치환
    if (template?.system_prompt_template) {
      return this._appendUnifiedOutputRules(this._substituteVars(template.system_prompt_template, vars));
    }

    // 5. 폴백: JSON에 데이터 없으면 default 템플릿 사용
    const defaultTemplate = await tm.getTemplate('_default');
    if (defaultTemplate?.doc_structure) {
      const rawDoc = (isCompact && defaultTemplate.doc_structure.compact)
        ? defaultTemplate.doc_structure.compact
        : defaultTemplate.doc_structure.standard;
      docStructure = rawDoc ? this._substituteVars(rawDoc, vars) : '';
      vars.docStructure = docStructure;
    }
    if (defaultTemplate?.system_prompt_template) {
      return this._appendUnifiedOutputRules(this._substituteVars(defaultTemplate.system_prompt_template, vars));
    }

    // 최종 폴백: 하드코딩된 기본 프롬프트
    return this._appendUnifiedOutputRules(`당신은 ${pc.role}입니다. ${chapterTitle}에 대한 교육자료를 작성해주세요.`);

  }

  /**
   * 생성된 챕터 콘텐츠 검증
   * @param {string} content - 생성된 마크다운 콘텐츠
   * @param {string} templateId - 템플릿 ID
   * @param {Object} chapterInfo - { chapterId, chapterTitle }
   * @param {number} charMin - 최소 글자 수
   * @param {number} charMax - 최대 글자 수
   * @returns {{ valid: boolean, warnings: string[], errors: string[] }}
   */
  _validateChapter(content, templateId, chapterInfo, charMin, charMax) {
    const warnings = [];
    const errors = [];
    const { chapterId } = chapterInfo;

    // 1. 길이 검사
    const charCount = content.length;
    if (charMin > 0 && charMax > 0) {
      if (charCount < charMin) {
        warnings.push(`[${chapterId}] 글자 수 부족: ${charCount.toLocaleString()}자 (최소 ${charMin.toLocaleString()}자)`);
      } else if (charCount > charMax) {
        warnings.push(`[${chapterId}] 글자 수 초과: ${charCount.toLocaleString()}자 (최대 ${charMax.toLocaleString()}자)`);
      }
    }

    // 2. 잘림(truncation) 감지 — 마지막 비공백 문자가 문장 종결 부호가 아닌 경우
    const trimmed = content.trimEnd();
    if (trimmed.length > 0) {
      // 이모지(서로게이트 페어) 안전 처리: Array.from으로 코드포인트 단위 분리
      const chars = Array.from(trimmed);
      const lastChar = chars[chars.length - 1];
      const validEndings = new Set(['.', '?', '!', ')', ']', '}', '"', "'", '`', '>', '。', '？', '！', '）', '」', '】', '*', '-', '|', '\n']);
      // 이모지/심볼 판정: SMP(U+10000+) 또는 BMP의 기호·픽토그램 영역만 정상 종결로 간주.
      // 이전 구현(codePoint > 0x2000)은 한글(U+AC00~U+D7A3)을 모두 이모지로 오판정해
      // 한국어로 끝나는 잘린 콘텐츠를 검출하지 못함.
      const cp = lastChar ? lastChar.codePointAt(0) : 0;
      const isEmojiOrSymbol = cp >= 0x10000 // SMP (대부분 이모지)
        || (cp >= 0x2600 && cp <= 0x27BF)   // 잡다한 기호/딩뱃
        || (cp >= 0x2300 && cp <= 0x23FF);  // 기술 기호
      if (!validEndings.has(lastChar) && !isEmojiOrSymbol) {
        errors.push(`[${chapterId}] 콘텐츠가 문장 중간에서 잘린 것으로 보입니다 (마지막 문자: '${lastChar}')`);
      }
    }

    // 3. 템플릿별 필수 섹션 검사 (template-info.json의 validation.section_checks 사용)
    const checks = this.templateInfo.validation?.section_checks || [];
    for (const check of checks) {
      const found = check.keywords.some(kw => content.includes(kw));
      if (!found) {
        warnings.push(`[${chapterId}] 필수 요소 누락: ${check.label}`);
      }
    }

    // 4. Mermaid 구문 기본 검증
    const mermaidBlockRegex = /```mermaid\s*\n([\s\S]*?)```/g;
    let match;
    let mermaidIndex = 0;
    while ((match = mermaidBlockRegex.exec(content)) !== null) {
      mermaidIndex++;
      const mermaidBody = match[1].trim();
      const validKeywords = ['flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'gantt', 'pie', 'gitgraph', 'mindmap', 'timeline', 'journey', 'quadrantChart', 'xychart', 'block'];
      const hasValidKeyword = validKeywords.some(kw => mermaidBody.startsWith(kw) || mermaidBody.includes('\n' + kw));
      if (!hasValidKeyword) {
        warnings.push(`[${chapterId}] Mermaid 블록 #${mermaidIndex}: 유효한 다이어그램 키워드가 없습니다`);
      }
    }

    // 5. ASCII 박스 사용 감지 (워크시트는 표로 통일 — 통합 출력 형식 규칙)
    const asciiBoxRegex = /[┌┐└┘├┤┬┴┼─│]/;
    if (asciiBoxRegex.test(content)) {
      warnings.push(`[${chapterId}] ASCII 박스 문자(┌─┐│└┘ 등) 발견 — 워크시트/치트시트는 마크다운 표로 작성하세요`);
    }

    // 6. SAMPLE 마커 정량 검증 (교사용 지도서 계열만)
    // Mermaid 카운트는 제외 (필요 없는 콘텐츠도 있으므로 강제하지 않음)
    const isTeacherGuide = ['teacher-guide-4c', 'teacher-guide'].includes(templateId);
    if (isTeacherGuide) {
      // (a) 교사 발화문: "선생님:" 또는 admonition `??? quote "선생님 스크립트"`
      const teacherSpeechCount = (content.match(/선생님\s*[:：]/g) || []).length
        + (content.match(/\?\?\?\s*quote\s+"선생님/g) || []).length;
      if (teacherSpeechCount < 3) {
        warnings.push(`[${chapterId}] 교사 발화문 부족: ${teacherSpeechCount}개 (권장 ≥ 3) — "선생님:" 또는 admonition 스크립트 추가`);
      }

      // (b) 분 단위 시간 표기 (예: "12분", "5~7분")
      const timeMarkerCount = (content.match(/\d+\s*분/g) || []).length;
      if (timeMarkerCount < 3) {
        warnings.push(`[${chapterId}] 분 단위 시간 표기 부족: ${timeMarkerCount}개 (권장 ≥ 3) — 활동마다 시간 배분 명시`);
      }

      // (c) admonition 박스 (??? 또는 !!!)
      const admonitionCount = (content.match(/^[!?]{3}\s+\w+/gm) || []).length;
      if (admonitionCount < 2) {
        warnings.push(`[${chapterId}] admonition 박스 부족: ${admonitionCount}개 (권장 ≥ 2) — "이 활동의 의도", "선생님 스크립트" 등 box 활용`);
      }

      // (d) 마크다운 표 (헤더 + 구분선 패턴)
      const tableCount = (content.match(/^\|.+\|\s*\n\|[\s\-:|]+\|/gm) || []).length;
      if (tableCount < 2) {
        warnings.push(`[${chapterId}] 마크다운 표 부족: ${tableCount}개 (권장 ≥ 2) — 비교/타임라인/루브릭은 표로 정리`);
      }

      // (e) 학생 예상 반응
      const studentReactionPattern = /(예상\s*반응|학생\s*[A-Z가-힣]?\s*[:：])/g;
      const studentReactionCount = (content.match(studentReactionPattern) || []).length;
      if (studentReactionCount < 2) {
        warnings.push(`[${chapterId}] 학생 예상 반응 부족: ${studentReactionCount}개 (권장 ≥ 2) — 발문에 예상 답변 동반`);
      }
    }

    const valid = errors.length === 0;
    return { valid, warnings, errors };
  }

  /**
   * 챕터 생성 후 검증을 실행하고 결과를 로그/콜백으로 전달
   * @returns {{ valid: boolean, warnings: string[], errors: string[] }}
   */
  _runPostGenerationValidation(content, chapterId, maxTokens, estimatedTime, progressCallback) {
    const templateId = this.templateInfo.template_id || '';
    const timeMinutes = this._parseTimeMinutes(estimatedTime);
    const effectiveMinutes = timeMinutes > 0 ? timeMinutes : 50;
    // 검증 기준: 콘텐츠 목표치만 사용 (모델 토큰 한도와 무관)
    // 이유: continuation으로 합쳐진 최종 콘텐츠는 모델 한도를 합산 초과할 수 있으므로
    // 단일 chunk 한도로 제한하면 정상 합본을 "초과"로 잘못 경고하게 됨.
    const charMin = effectiveMinutes * 300;
    const charMax = effectiveMinutes * 500;

    const validation = this._validateChapter(content, templateId, { chapterId }, charMin, charMax);

    // 로그에 기록
    if (validation.errors.length > 0) {
      for (const err of validation.errors) {
        this._log(`🔴 검증 오류: ${err}`);
      }
    }
    if (validation.warnings.length > 0) {
      for (const warn of validation.warnings) {
        this._log(`🟡 검증 경고: ${warn}`);
      }
    }
    if (validation.valid && validation.warnings.length === 0) {
      this._log(`🟢 ${chapterId} 검증 통과`);
    }

    // SSE 진행 이벤트로 전달
    if (progressCallback) {
      if (validation.errors.length > 0 || validation.warnings.length > 0) {
        const issues = [...validation.errors, ...validation.warnings];
        progressCallback(`🔍 ${chapterId} 검증 결과: ${issues.join(' | ')}`);
      } else {
        progressCallback(`🔍 ${chapterId} 검증 통과`);
      }
    }

    return validation;
  }

  /**
   * 단일 챕터 생성 (rate limit 자동 재시도 포함)
   */
  async generateChapter(chapterId, chapterTitle, partContext = '', model = 'claude-opus-4-7', maxTokens = 0, progressCallback = null, estimatedTime = '', totalChapters = 0, currentNum = 0, tokenBudget = null) {
    const timeMinutes = this._parseTimeMinutes(estimatedTime);
    const effectiveMaxTokens = this._calcMaxTokensForTime(timeMinutes, maxTokens, model);

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
      if (progressCallback) {
        const providerName = { anthropic: 'Claude', openai: 'OpenAI', google: 'Gemini', upstage: 'Solar' }[detectProvider(model)] || 'AI';
        progressCallback(`🤖 ${chapterId} ${providerName} API 호출 중...`);
      }

      const result = await this._streamGenerate(model, effectiveMaxTokens, prompt, chapterId, progressCallback);
      const finalContent = result.content;

      const chapterFile = join(this.docsPath, `${chapterId}.md`);
      await writeFile(chapterFile, finalContent, 'utf-8');

      if (tokenBudget) {
        tokenBudget.recordUsage(result.outputTokens, reserved);
      }

      this._log(`✅ ${chapterId} 생성 완료 - 입력: ${result.inputTokens}, 출력: ${result.outputTokens}, 문자 수: ${finalContent.length}`);
      if (progressCallback) progressCallback(`✅ ${chapterId} 완료! (${finalContent.length.toLocaleString()}자, 토큰: ${(result.inputTokens + result.outputTokens).toLocaleString()})`);

      // 생성 후 검증 (비차단 — 실패해도 저장은 유지)
      const validation = this._runPostGenerationValidation(finalContent, chapterId, effectiveMaxTokens, estimatedTime, progressCallback);

      return {
        success: true,
        chapter_id: chapterId,
        file_path: chapterFile,
        content: finalContent,
        tokens_used: result.inputTokens + result.outputTokens,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        validation,
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
            const retryContent = retryResult.content;

            const chapterFile = join(this.docsPath, `${chapterId}.md`);
            await writeFile(chapterFile, retryContent, 'utf-8');

            if (tokenBudget) {
              tokenBudget.recordUsage(retryResult.outputTokens, reserved);
            }

            this._log(`✅ ${chapterId} 재시도 ${attempt} 성공 - 입력: ${retryResult.inputTokens}, 출력: ${retryResult.outputTokens}`);
            if (progressCallback) progressCallback(`✅ ${chapterId} 재시도 완료! (${retryContent.length.toLocaleString()}자)`);

            const validation = this._runPostGenerationValidation(retryContent, chapterId, effectiveMaxTokens, estimatedTime, progressCallback);

            return {
              success: true,
              chapter_id: chapterId,
              file_path: chapterFile,
              content: retryContent,
              tokens_used: retryResult.inputTokens + retryResult.outputTokens,
              input_tokens: retryResult.inputTokens,
              output_tokens: retryResult.outputTokens,
              retried: true,
              validation,
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
          const retryContent529 = retryResult.content;

          const chapterFile = join(this.docsPath, `${chapterId}.md`);
          await writeFile(chapterFile, retryContent529, 'utf-8');

          if (tokenBudget) {
            tokenBudget.recordUsage(retryResult.outputTokens, reserved);
          }

          this._log(`✅ ${chapterId} 529 재시도 성공`);
          if (progressCallback) progressCallback(`✅ ${chapterId} 재시도 완료! (${retryContent529.length.toLocaleString()}자)`);

          const validation = this._runPostGenerationValidation(retryContent529, chapterId, effectiveMaxTokens, estimatedTime, progressCallback);

          return {
            success: true,
            chapter_id: chapterId,
            file_path: chapterFile,
            content: retryContent529,
            tokens_used: retryResult.inputTokens + retryResult.outputTokens,
            input_tokens: retryResult.inputTokens,
            output_tokens: retryResult.outputTokens,
            retried: true,
            validation,
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
  async generateAllChapters(tocData, model = 'claude-opus-4-7', maxTokens = 0, concurrent = 1, progressCallback = null, skipCompleted = true, tpmLimit = 0, chapterIds = null) {
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
