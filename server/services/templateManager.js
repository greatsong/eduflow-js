import { readFile, writeFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { TEMPLATE_VERSION } from '../../shared/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = join(__dirname, '..', '..', 'templates');

// 회로도(hw-diagram) 프롬프트 — 모든 템플릿에서 옵션으로 사용 가능
const HW_DIAGRAM_PROMPT = `

### 시각 자료 & 회로도

하드웨어 관련 시각 자료는 **반드시** 아래 HTML 마크업을 사용:

\`\`\`html
<!-- Pico 핀 배치도 -->
<div class="hw-diagram" data-type="pico-pinout"
     data-highlight='[{"pin":"핀이름","label":"용도","color":"색상코드"}]'>
</div>

<!-- 회로 연결도 -->
<div class="hw-diagram" data-type="connection"
     data-title="제목"
     data-connections='[{"from":"핀","to":"부품","then":"다음부품","color":"색상"}]'
     data-notes='["주의사항1","주의사항2"]'>
</div>

<!-- 센서 모듈 연결 -->
<div class="hw-diagram" data-type="sensor-module"
     data-sensor="센서명"
     data-title="제목"
     data-connections='[{"pin":"센서핀","to":"Pico핀","note":"설명","color":"색상"}]'>
</div>
\`\`\`

소프트웨어/개념 다이어그램은 Mermaid를 사용:
\`\`\`mermaid
flowchart LR
  A[입력] --> B[처리] --> C[출력]
\`\`\`
`;

export class TemplateManager {
  constructor(templatesDir = null) {
    this.templatesDir = templatesDir || join(__dirname, '..', '..', 'templates');
  }

  async listTemplates() {
    if (!existsSync(this.templatesDir)) return [];

    const files = await readdir(this.templatesDir);
    const templates = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(this.templatesDir, file), 'utf-8');
        templates.push(JSON.parse(raw));
      } catch (e) {
        console.error(`템플릿 로드 실패 (${file}):`, e.message);
      }
    }

    return templates;
  }

  async getTemplate(templateId) {
    const filePath = join(this.templatesDir, `${templateId}.json`);
    if (!existsSync(filePath)) return null;

    try {
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('템플릿 로드 실패:', e.message);
      return null;
    }
  }

  async applyTemplate(templateId, projectPath, variables = {}) {
    const template = await this.getTemplate(templateId);
    if (!template) return false;

    let contextTemplate = template.context_template || '';

    // 변수 치환
    for (const [key, value] of Object.entries(variables)) {
      contextTemplate = contextTemplate.replaceAll(`{{${key}}}`, String(value));
    }

    try {
      // master-context.md 생성
      const contextFile = join(projectPath, 'master-context.md');
      await writeFile(contextFile, `# 템플릿: ${template.name}\n\n${contextTemplate}`, 'utf-8');

      // template-info.json 저장
      const templateInfoFile = join(projectPath, 'template-info.json');
      const templateInfoData = {
        template_id: templateId,
        template_name: template.name,
        toc_prompt_addition: template.toc_prompt_addition || '',
        chapter_prompt_addition: template.chapter_prompt_addition || '',
      };
      if (template.required_assets) {
        templateInfoData.required_assets = template.required_assets;
      }
      if (template.validation) {
        templateInfoData.validation = template.validation;
      }
      await writeFile(templateInfoFile, JSON.stringify(templateInfoData, null, 2), 'utf-8');

      return true;
    } catch (e) {
      console.error('템플릿 적용 실패:', e.message);
      return false;
    }
  }

  async getTocPromptAddition(projectPath) {
    const filePath = join(projectPath, 'template-info.json');
    if (!existsSync(filePath)) return '';
    try {
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw).toc_prompt_addition || '';
    } catch {
      return '';
    }
  }

  async getChapterPromptAddition(projectPath) {
    const filePath = join(projectPath, 'template-info.json');
    let addition = '';
    try {
      if (existsSync(filePath)) {
        const raw = await readFile(filePath, 'utf-8');
        addition = JSON.parse(raw).chapter_prompt_addition || '';
      }
    } catch {
      // ignore
    }

    // config.json에서 include_hw_diagrams 옵션 확인
    const configPath = join(projectPath, 'config.json');
    try {
      if (existsSync(configPath)) {
        const configRaw = await readFile(configPath, 'utf-8');
        const config = JSON.parse(configRaw);
        if (config.include_hw_diagrams) {
          // 이미 hw-diagram 마크업이 포함된 템플릿(class-preview)은 중복 추가 안 함
          if (!addition.includes('hw-diagram')) {
            addition += HW_DIAGRAM_PROMPT;
          }
        }
      }
    } catch {
      // ignore
    }

    return addition;
  }
}

// ============================================================
// TemplateComposer — 3축(구조 × 맥락 × 도구) 조합 엔진 (v2)
// CONSTITUTION.md 제4조: 구조·맥락·도구의 독립적 발전
// ============================================================
export class TemplateComposer {
  constructor() {
    this.whatDir = join(TEMPLATES_ROOT, 'what');
    this.howDir = join(TEMPLATES_ROOT, 'how');
    this.featuresDir = join(TEMPLATES_ROOT, 'features');
  }

  // ── 디렉토리 스캔 ──

  async _loadDir(dir) {
    if (!existsSync(dir)) return [];
    const files = await readdir(dir);
    const items = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(dir, file), 'utf-8');
        items.push(JSON.parse(raw));
      } catch (e) {
        console.error(`템플릿 로드 실패 (${file}):`, e.message);
      }
    }
    return items;
  }

  async listWhats() { return this._loadDir(this.whatDir); }
  async listHows() { return this._loadDir(this.howDir); }
  async listFeatures() { return this._loadDir(this.featuresDir); }

  async loadWhat(id) {
    const filePath = join(this.whatDir, `${id}.json`);
    if (!existsSync(filePath)) {
      // 폴백: _default
      const fallback = join(this.whatDir, '_default.json');
      if (!existsSync(fallback)) return null;
      const raw = await readFile(fallback, 'utf-8');
      return JSON.parse(raw);
    }
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  }

  async loadHow(id) {
    const filePath = join(this.howDir, `${id}.json`);
    if (!existsSync(filePath)) return null;
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  }

  async loadFeatures(ids = []) {
    const features = [];
    for (const id of ids) {
      const filePath = join(this.featuresDir, `${id}.json`);
      if (existsSync(filePath)) {
        try {
          const raw = await readFile(filePath, 'utf-8');
          features.push(JSON.parse(raw));
        } catch { /* skip */ }
      }
    }
    return features;
  }

  // ── 호환성 검사 ──

  checkCompatibility(what, how, featureIds = []) {
    const warnings = [];

    // WHAT-HOW 호환성
    if (what.compatible_hows && !what.compatible_hows.includes(how.id)) {
      warnings.push(`"${what.name}" 교과는 "${how.name}" 모델과의 조합이 검증되지 않았습니다. 결과 품질이 낮을 수 있습니다.`);
    }
    if (how.compatible_whats && !how.compatible_whats.includes(what.id)) {
      warnings.push(`"${how.name}" 모델은 "${what.name}" 교과와의 조합이 검증되지 않았습니다.`);
    }

    // Feature 충돌
    const forbidden = new Set([...(what.forbidden_features || []), ...(how.forbidden_features || [])]);
    for (const fid of featureIds) {
      if (forbidden.has(fid)) {
        warnings.push(`"${fid}" 기능은 현재 조합에서 비활성화됩니다.`);
      }
    }

    return { valid: true, warnings }; // 경고만, 차단하지 않음 (헌법 제1조: 교사 주권)
  }

  // ── 핵심: 프롬프트 조합 ──

  async compose(whatId, howId, featureIds = [], contextAnswers = {}) {
    const what = await this.loadWhat(whatId || '_default');
    const how = await this.loadHow(howId);
    if (!how) throw new Error(`교육 모델 "${howId}"를 찾을 수 없습니다`);
    if (!what) throw new Error(`교과 전문성 템플릿을 찾을 수 없습니다`);

    // forbidden features 필터링
    const forbidden = new Set([...(what.forbidden_features || []), ...(how.forbidden_features || [])]);
    const activeFeatureIds = featureIds.filter(id => !forbidden.has(id));
    const features = await this.loadFeatures(activeFeatureIds);

    // 1) 페르소나 병합
    const persona = this._mergePersona(what, how);

    // 2) contentRules (WHAT에서)
    const contentRules = what.content_rules || '';

    // 3) featureBlocks (Features에서)
    const featureBlocks = features.map(f => f.prompt_block).filter(Boolean).join('\n\n');

    // 4) toc/chapter additions 합성
    const tocAddition = [what.toc_addition, how.toc_addition].filter(Boolean).join('\n\n');
    const chapterAddition = [
      what.chapter_addition,
      how.chapter_addition,
      ...features.map(f => f.prompt_block),
    ].filter(Boolean).join('\n\n');

    // 5) context_template 변수 치환
    let contextTemplate = what.context_template || '';
    for (const [key, value] of Object.entries(contextAnswers)) {
      contextTemplate = contextTemplate.replaceAll(`{{${key}}}`, String(value));
    }

    // 6) 교육학적 맥락 블록 생성 (context_answers → 챕터 프롬프트 직접 주입용)
    //    master-context.md와 별개로, 챕터 생성 시 AI가 직접 참고하는 구조화된 맥락
    const pedagogicalContext = this._buildPedagogicalContext(what, contextAnswers);

    // 7) required_assets 병합
    const requiredAssets = this._mergeAssets(how.required_assets, features);

    // 8) 호환성 검사
    const compatibility = this.checkCompatibility(what, how, featureIds);

    return {
      persona,
      systemPromptTemplate: how.system_prompt_template || '',
      contentRules,
      featureBlocks,
      deliveryRules: how.delivery_rules || '',
      pedagogicalContext,
      tocAddition,
      chapterAddition,
      docStructure: how.doc_structure || {},
      validation: how.validation || {},
      requiredAssets,
      contextTemplate,
      templateName: `${what.name} × ${how.name}`,
      compatibility,
    };
  }

  // ── v2 프로젝트 생성 시 template-info.json 저장 ──

  async applyV2(projectPath, whatId, howId, featureIds, contextAnswers = {}) {
    const composed = await this.compose(whatId, howId, featureIds, contextAnswers);

    // master-context.md 생성
    const contextFile = join(projectPath, 'master-context.md');
    await writeFile(contextFile, `# 템플릿: ${composed.templateName}\n\n${composed.contextTemplate}`, 'utf-8');

    // template-info.json v2 저장
    const templateInfoFile = join(projectPath, 'template-info.json');
    const templateInfo = {
      version: TEMPLATE_VERSION.TWO_AXIS,
      what_id: whatId,
      how_id: howId,
      features: featureIds,
      context_answers: contextAnswers,
      template_name: composed.templateName,
      toc_prompt_addition: composed.tocAddition,
      chapter_prompt_addition: composed.chapterAddition,
      pedagogical_context: composed.pedagogicalContext,
      validation: composed.validation,
      required_assets: composed.requiredAssets,
    };
    await writeFile(templateInfoFile, JSON.stringify(templateInfo, null, 2), 'utf-8');

    return { composed, templateInfo };
  }

  // ── 내부 헬퍼 ──

  _mergePersona(what, how) {
    const wf = what.persona_fragment || {};
    const hf = how.persona_fragment || {};
    return {
      role: `${hf.role_prefix || '교육 콘텐츠 전문가'}${wf.role_suffix || ''}`,
      audience: hf.audience || '학습자',
      philosophy: wf.philosophy || '체계적이고 이해하기 쉬운 교육자료를 만든다',
      style: [wf.content_style, hf.style].filter(Boolean).join(', ') || '체계적인 설명',
      tone: hf.tone || '친근하고 격려하는 톤',
    };
  }

  _mergeAssets(howAssets = {}, features = []) {
    const merged = { ...howAssets };
    for (const f of features) {
      if (!f.required_assets) continue;
      for (const [key, arr] of Object.entries(f.required_assets)) {
        if (!merged[key]) merged[key] = [];
        merged[key] = [...new Set([...merged[key], ...arr])];
      }
    }
    return merged;
  }

  /**
   * 교육학적 맥락 블록 생성
   * - context_answers를 챕터/목차 프롬프트에 직접 주입하기 위한 구조화된 텍스트
   * - 학술적 프레임워크가 아닌, AI가 좋은 교재를 만들기 위해 필요한 실질적 맥락
   * - 헌법 제6조(대화형 협력): 교사의 의도를 AI가 정확히 이해하도록 돕는다
   */
  _buildPedagogicalContext(what, contextAnswers = {}) {
    if (!contextAnswers || Object.keys(contextAnswers).length === 0) return '';

    const questions = what.context_questions || [];
    const lines = ['## 교사가 설정한 교육 맥락'];

    for (const q of questions) {
      const answer = contextAnswers[q.id];
      if (!answer || answer === '') continue;
      lines.push(`- **${q.label}**: ${answer}`);
    }

    if (lines.length <= 1) return ''; // 답변이 하나도 없으면 빈 문자열

    lines.push('');
    lines.push('위 맥락을 반영하여 학습자 수준에 맞는 내용과 난이도를 조절하세요.');
    return lines.join('\n');
  }
}
