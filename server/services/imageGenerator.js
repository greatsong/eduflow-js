/**
 * 이미지 생성 서비스 v2
 *
 * v1 대비 개선:
 * - 멀티 프로바이더: Google Gemini (기본) + OpenAI DALL-E 3 (폴백)
 * - JSON 기반 이미지 메타데이터 관리 (프롬프트, 모델, 해상도, 평가 등)
 * - 해상도 옵션: 'standard'(1K) / 'high'(2K)
 * - LOCAL_MODE: API 키 없으면 플레이스홀더 SVG 생성
 * - 이미지 품질 평가(rating) 기록
 *
 * 플레이스홀더 형식: <!-- IMAGE: 설명 텍스트 -->
 * 교체 결과: ![설명](images/filename.png)
 */
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';

// 이미지 플레이스홀더 정규식
const PLACEHOLDER_REGEX = /<!-- IMAGE: (.+?) -->/g;

// Google Gemini 이미지 모델 (폴백 순서)
const GEMINI_IMAGE_MODELS = [
  'gemini-3.1-flash-image-preview',
  'gemini-2.0-flash-preview-image-generation',
];

// 병렬 생성 동시 요청 수 (API 레이트 리밋 고려)
const MAX_CONCURRENT = 3;

// 해상도 매핑
const RESOLUTION_MAP = {
  standard: '1K',
  high: '2K',
};

/**
 * 이미지 메타데이터 JSON 저장소
 * 프로젝트별 images_meta.json에 기록
 */
class ImageMetadataStore {
  constructor(projectPath) {
    this.filePath = join(projectPath, 'images_meta.json');
    this._data = null;
  }

  async load() {
    if (this._data) return this._data;
    if (existsSync(this.filePath)) {
      try {
        this._data = JSON.parse(await readFile(this.filePath, 'utf-8'));
      } catch {
        this._data = { images: [] };
      }
    } else {
      this._data = { images: [] };
    }
    return this._data;
  }

  async save() {
    if (!this._data) return;
    await writeFile(this.filePath, JSON.stringify(this._data, null, 2), 'utf-8');
  }

  async addImage(meta) {
    await this.load();
    // 동일 filename이 있으면 교체
    const idx = this._data.images.findIndex(img => img.filename === meta.filename);
    if (idx >= 0) {
      this._data.images[idx] = { ...this._data.images[idx], ...meta, updated_at: new Date().toISOString() };
    } else {
      this._data.images.push({
        id: randomUUID(),
        ...meta,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    await this.save();
    return this._data.images.find(img => img.filename === meta.filename);
  }

  async getByProject() {
    await this.load();
    return this._data.images;
  }

  async getByChapter(chapterId) {
    await this.load();
    return this._data.images.filter(img => img.chapter_id === chapterId);
  }

  async getById(imageId) {
    await this.load();
    return this._data.images.find(img => img.id === imageId);
  }

  async updateRating(imageId, rating) {
    await this.load();
    const img = this._data.images.find(i => i.id === imageId);
    if (!img) return null;
    img.rating = rating;
    img.updated_at = new Date().toISOString();
    await this.save();
    return img;
  }
}

export class ImageGenerator {
  /**
   * @param {object} options
   * @param {string} [options.googleApiKey] - Google API 키
   * @param {string} [options.openaiApiKey] - OpenAI API 키
   * @param {string} [options.styleGuide] - 이미지 스타일 가이드라인
   * @param {string} [options.resolution] - 'standard' | 'high'
   * @param {string} [options.projectPath] - 프로젝트 경로 (메타데이터 저장용)
   * @param {object} [options.usageTracker] - { record(data) } 토큰 사용량 기록기
   * @param {object} [options.userInfo] - { userId, userName, userEmail, projectId }
   */
  constructor(options = {}) {
    // 하위 호환: 첫 인자가 문자열이면 v1 스타일 생성자
    if (typeof options === 'string') {
      const [apiKey, model, usageTracker, userInfo, styleGuide] = arguments;
      this.googleApiKey = apiKey;
      this.openaiApiKey = null;
      this.styleGuide = styleGuide || '';
      this.resolution = 'standard';
      this.projectPath = null;
      this.usageTracker = usageTracker || null;
      this.userInfo = userInfo || {};
      this.model = model || GEMINI_IMAGE_MODELS[0];
      this._metaStore = null;
    } else {
      this.googleApiKey = options.googleApiKey || null;
      this.openaiApiKey = options.openaiApiKey || null;
      this.styleGuide = options.styleGuide || '';
      this.resolution = options.resolution || 'standard';
      this.projectPath = options.projectPath || null;
      this.usageTracker = options.usageTracker || null;
      this.userInfo = options.userInfo || {};
      this.model = GEMINI_IMAGE_MODELS[0];
      this._metaStore = this.projectPath ? new ImageMetadataStore(this.projectPath) : null;
    }

    // 클라이언트 초기화 (지연)
    this._googleClient = null;
    this._openaiClient = null;
  }

  _getGoogleClient() {
    if (!this._googleClient && this.googleApiKey) {
      this._googleClient = new GoogleGenAI({ apiKey: this.googleApiKey });
    }
    return this._googleClient;
  }

  _getOpenAIClient() {
    if (!this._openaiClient && this.openaiApiKey) {
      this._openaiClient = new OpenAI({ apiKey: this.openaiApiKey });
    }
    return this._openaiClient;
  }

  /**
   * 사용 가능한 프로바이더 확인
   * @returns {'google'|'openai'|'none'}
   */
  get availableProvider() {
    if (this.googleApiKey) return 'google';
    if (this.openaiApiKey) return 'openai';
    return 'none';
  }

  _recordUsage(modelUsed, provider, success) {
    if (!this.usageTracker) return;
    try {
      this.usageTracker.record({
        ...this.userInfo,
        action: 'image-generation',
        provider,
        model: modelUsed,
        inputTokens: 0,
        outputTokens: 0,
        imageCount: success ? 1 : 0,
        keySource: 'server',
      });
    } catch { /* fire-and-forget */ }
  }

  /**
   * 마크다운에서 이미지 플레이스홀더 추출
   */
  findPlaceholders(markdown) {
    const placeholders = [];
    let match;
    const regex = new RegExp(PLACEHOLDER_REGEX.source, PLACEHOLDER_REGEX.flags);
    while ((match = regex.exec(markdown)) !== null) {
      placeholders.push({
        fullMatch: match[0],
        description: match[1].trim(),
        index: match.index,
      });
    }
    return placeholders;
  }

  /**
   * 교육용 이미지 프롬프트를 정교하게 구성.
   *
   * 기본 품질 정책 (2026-04-18 강화):
   * - 기존 warm/pastel 감성은 유지하되 "선명도·디테일·텍스트 왜곡 방지"를 명시적으로 지시
   * - Composition / Art style / Technical quality / Color & lighting / Do not produce로
   *   계층화해서 모델이 각 항목을 빼먹지 않도록 함
   * - 글자(한글·영문)가 이미지 안에 직접 렌더되는 것을 명시적으로 금지 → 왜곡된 글자 아티팩트 최소화
   */
  _buildPrompt(description) {
    const base = [
      `Create a sharp, high-detail educational illustration for a high school or university textbook page.`,
      ``,
      `Subject: ${description}`,
      ``,
      `Composition:`,
      `- Single focal subject clearly centered, with supporting context around it`,
      `- Landscape orientation (wider than tall), suitable for wide book-page layouts`,
      `- Strong visual hierarchy: the primary subject is the largest and sharpest element`,
      `- Leave generous breathing room around the subject; do not fill every corner`,
      ``,
      `Art style:`,
      `- Warm-toned animation-style illustration with crisp, clean linework`,
      `- Friendly, approachable characters, objects, and environments`,
      `- Soft pastel color palette with warm highlights, combined with strong contrast between the subject and the background`,
      `- Smooth gradients only in large flat areas; avoid muddy, blurry, or noisy shading`,
      `- Anti-aliased vector-like edges, sharp silhouettes, consistent line weight`,
      ``,
      `Technical quality:`,
      `- Render at high resolution so fine detail remains crisp at 1024x1024 or larger`,
      `- No motion blur, no JPEG-like compression artifacts, no chromatic aberration, no film grain`,
      `- No text, labels, captions, watermarks, signatures, speech bubbles with words, or UI mockups anywhere in the image`,
      `- If the subject mentions text content (Korean or English), represent it abstractly — use generic line placeholders, symbolic shapes, or icons rather than attempting to render real letters`,
      `- If showing a process or sequence: use arrows and simple numbered markers arranged left-to-right or top-to-bottom`,
      ``,
      `Color & lighting:`,
      `- Coherent palette of 4 to 6 harmonized colors`,
      `- Soft, directional lighting with a warm key light`,
      `- Light, warm, uncluttered background that frames the subject without competing with it`,
      ``,
      `Do not produce:`,
      `- Photorealistic close-up human faces`,
      `- Handwritten-style text or decorative typography`,
      `- Decorative frames, borders, or page-layout elements (the image will be placed inside a textbook layout)`,
      `- Culturally biased stereotypes or dated imagery`,
      ``,
      `Purpose:`,
      `- Every visible element must serve the educational subject; remove incidental clutter`,
      `- Suitable for high school to university students`,
    ];

    if (this.styleGuide) {
      base.push('');
      base.push('Additional style guide from the author:');
      base.push(this.styleGuide);
    }

    return base.join('\n');
  }

  // ============================================================
  // Google Gemini 이미지 생성
  // ============================================================
  async _generateWithGoogle(description) {
    const client = this._getGoogleClient();
    if (!client) throw new Error('Google API 키가 설정되지 않았습니다');

    const prompt = this._buildPrompt(description);
    const imageSize = RESOLUTION_MAP[this.resolution] || '1K';

    // 모델 폴백
    const modelsToTry = [this.model, ...GEMINI_IMAGE_MODELS.filter(m => m !== this.model)];

    for (const modelName of modelsToTry) {
      try {
        const response = await client.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: { aspectRatio: '3:2', imageSize },
          },
        });

        if (response.candidates?.[0]?.content?.parts) {
          const parts = response.candidates[0].content.parts;
          for (const part of parts) {
            if (part.inlineData) {
              console.log(`[ImageGen] Google 이미지 생성 성공 (모델: ${modelName}, mime: ${part.inlineData.mimeType}, bytes: ${part.inlineData.data?.length || 0})`);
              this._recordUsage(modelName, 'google', true);
              return {
                success: true,
                imageData: part.inlineData.data,
                mimeType: part.inlineData.mimeType || 'image/png',
                provider: 'google',
                ai_model: modelName,
              };
            }
          }
          // 이미지가 없고 텍스트만 있는 경우 로깅
          const textParts = parts.filter(p => p.text).map(p => p.text.substring(0, 100));
          console.warn(`[ImageGen] Google 응답에 이미지 없음 (${modelName}), 텍스트만 ${parts.length}개 파트: ${textParts.join(' | ')}`);
        } else {
          const finishReason = response.candidates?.[0]?.finishReason || 'unknown';
          console.warn(`[ImageGen] Google 응답 구조 비정상 (${modelName}), finishReason: ${finishReason}`);
        }
      } catch (error) {
        console.error(`[ImageGen] Google 이미지 생성 실패 (${modelName}):`, error.message);
        this._recordUsage(modelName, 'google', false);
        continue;
      }
    }

    return { success: false, error: 'Google 이미지 모델 모두 실패' };
  }

  // ============================================================
  // OpenAI DALL-E 3 이미지 생성
  // ============================================================
  async _generateWithOpenAI(description) {
    const client = this._getOpenAIClient();
    if (!client) throw new Error('OpenAI API 키가 설정되지 않았습니다');

    const prompt = this._buildPrompt(description);
    const size = this.resolution === 'high' ? '1792x1024' : '1024x1024';

    try {
      const response = await client.images.generate({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size,
        quality: this.resolution === 'high' ? 'hd' : 'standard',
        response_format: 'b64_json',
      });

      const imageData = response.data[0]?.b64_json;
      if (imageData) {
        console.log('[ImageGen] OpenAI DALL-E 3 이미지 생성 성공');
        this._recordUsage('dall-e-3', 'openai', true);
        return {
          success: true,
          imageData,
          mimeType: 'image/png',
          provider: 'openai',
          ai_model: 'dall-e-3',
        };
      }

      return { success: false, error: 'OpenAI 응답에 이미지 데이터 없음' };
    } catch (error) {
      console.error('[ImageGen] OpenAI DALL-E 3 실패:', error.message);
      this._recordUsage('dall-e-3', 'openai', false);
      return { success: false, error: error.message };
    }
  }

  // ============================================================
  // 플레이스홀더 SVG 생성 (LOCAL_MODE)
  // ============================================================
  _generatePlaceholderSVG(description) {
    // 설명 텍스트를 여러 줄로 분할 (SVG에서 자동 줄바꿈 불가)
    const maxCharsPerLine = 28;
    const words = description.split(/\s+/);
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length > maxCharsPerLine) {
        if (currentLine) lines.push(currentLine.trim());
        currentLine = word;
      } else {
        currentLine = currentLine ? currentLine + ' ' + word : word;
      }
    }
    if (currentLine) lines.push(currentLine.trim());

    // 최대 4줄까지
    const displayLines = lines.slice(0, 4);
    if (lines.length > 4) {
      displayLines[3] = displayLines[3].slice(0, maxCharsPerLine - 3) + '...';
    }

    const lineHeight = 22;
    const startY = 130 - (displayLines.length * lineHeight) / 2;

    const textElements = displayLines
      .map((line, i) => `    <text x="200" y="${startY + i * lineHeight}" text-anchor="middle" font-family="'Pretendard', 'Noto Sans KR', sans-serif" font-size="14" fill="#475569">${_escapeXml(line)}</text>`)
      .join('\n');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f0f9ff;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#e0f2fe;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="400" height="260" rx="12" fill="url(#bg)" stroke="#bae6fd" stroke-width="2" stroke-dasharray="8,4"/>
  <g transform="translate(175, 30)">
    <rect x="0" y="0" width="50" height="40" rx="4" fill="#93c5fd" opacity="0.6"/>
    <circle cx="15" cy="15" r="6" fill="#fbbf24"/>
    <polygon points="10,40 25,20 40,40" fill="#6ee7b7" opacity="0.7"/>
    <polygon points="25,40 35,25 50,40" fill="#86efac" opacity="0.5"/>
  </g>
  <line x1="40" y1="85" x2="360" y2="85" stroke="#bae6fd" stroke-width="1"/>
${textElements}
  <text x="200" y="235" text-anchor="middle" font-family="monospace" font-size="11" fill="#94a3b8">[ AI 이미지 생성 대기 중 ]</text>
</svg>`;

    return svg;
  }

  // ============================================================
  // 통합 이미지 생성 (프로바이더 폴백 + LOCAL_MODE)
  // ============================================================
  async generateImage(description) {
    // 1. Google Gemini 시도
    if (this.googleApiKey) {
      const result = await this._generateWithGoogle(description);
      if (result.success) return result;
    }

    // 2. OpenAI DALL-E 3 폴백
    if (this.openaiApiKey) {
      const result = await this._generateWithOpenAI(description);
      if (result.success) return result;
    }

    // 3. 모든 프로바이더 실패 또는 키 없음 → 플레이스홀더 SVG
    console.log('[ImageGen] API 키 없음 또는 모든 프로바이더 실패 → 플레이스홀더 SVG 생성');
    const svgContent = this._generatePlaceholderSVG(description);
    return {
      success: true,
      imageData: Buffer.from(svgContent).toString('base64'),
      mimeType: 'image/svg+xml',
      provider: 'placeholder',
      ai_model: 'none',
      isPlaceholder: true,
    };
  }

  /**
   * 단일 이미지 생성 및 저장
   * @param {string} prompt - 이미지 설명
   * @param {string} filename - 저장할 파일명
   * @param {string} [docsPath] - docs 디렉토리 경로 (하위 호환)
   * @param {string} [chapterId] - 챕터 ID (메타데이터용)
   * @returns {{ success, filename, size, provider, ai_model, isPlaceholder }}
   */
  async generateSingle(prompt, filename, docsPath, chapterId = null) {
    const basePath = docsPath || (this.projectPath ? join(this.projectPath, 'docs') : null);
    if (!basePath) throw new Error('이미지 저장 경로가 지정되지 않았습니다');

    const imagesDir = join(basePath, 'images');
    if (!existsSync(imagesDir)) {
      await mkdir(imagesDir, { recursive: true });
    }

    const imgResult = await this.generateImage(prompt);

    // SVG 플레이스홀더인 경우 확장자 조정
    let actualFilename = filename;
    if (imgResult.isPlaceholder && !filename.endsWith('.svg')) {
      actualFilename = filename.replace(/\.[^.]+$/, '.svg');
    }

    const buffer = Buffer.from(imgResult.imageData, 'base64');
    await writeFile(join(imagesDir, actualFilename), buffer);

    // 메타데이터 기록
    if (this._metaStore) {
      await this._metaStore.addImage({
        filename: actualFilename,
        chapter_id: chapterId,
        prompt,
        provider: imgResult.provider,
        ai_model: imgResult.ai_model,
        resolution: this.resolution,
        file_size: buffer.length,
        width: imgResult.isPlaceholder ? 400 : null,
        height: imgResult.isPlaceholder ? 260 : null,
        status: imgResult.isPlaceholder ? 'placeholder' : 'generated',
        rating: null,
      });
    }

    return {
      success: true,
      filename: actualFilename,
      size: buffer.length,
      provider: imgResult.provider,
      ai_model: imgResult.ai_model,
      isPlaceholder: imgResult.isPlaceholder || false,
    };
  }

  /**
   * 챕터 마크다운의 플레이스홀더를 실제 이미지로 교체 (병렬 생성)
   * @param {string} content - 챕터 마크다운
   * @param {string} projectId - 프로젝트 ID
   * @param {string} chapterId - 챕터 ID
   * @param {string} [docsPath] - docs 디렉토리 (하위 호환)
   * @param {function} [progressCallback] - 진행 상황 콜백
   * @returns {string} 이미지가 교체된 마크다운
   */
  async processChapterImages(content, projectIdOrDocsPath, chapterId, progressCallback = null) {
    const placeholders = this.findPlaceholders(content);
    if (placeholders.length === 0) return content;

    // 하위 호환: 두 번째 인자가 docs 경로일 수 있음
    let docsPath;
    if (projectIdOrDocsPath && projectIdOrDocsPath.includes('/')) {
      docsPath = projectIdOrDocsPath;
    } else if (this.projectPath) {
      docsPath = join(this.projectPath, 'docs');
    } else {
      throw new Error('이미지 저장 경로를 결정할 수 없습니다');
    }

    const imagesDir = join(docsPath, 'images');
    if (!existsSync(imagesDir)) {
      await mkdir(imagesDir, { recursive: true });
    }

    if (progressCallback) {
      const providerLabel = this.availableProvider === 'none' ? '플레이스홀더' : this.availableProvider;
      progressCallback(`🖼️ 이미지 ${placeholders.length}장 생성 시작 (${providerLabel})...`);
    }

    // 병렬 생성 (MAX_CONCURRENT 단위로 배치)
    const results = [];
    for (let i = 0; i < placeholders.length; i += MAX_CONCURRENT) {
      const batch = placeholders.slice(i, i + MAX_CONCURRENT);
      const batchResults = await Promise.allSettled(
        batch.map(async (ph, batchIdx) => {
          const globalIdx = i + batchIdx;
          const filename = `${chapterId}_img${globalIdx + 1}.png`;

          if (progressCallback) {
            const desc = ph.description.length > 40
              ? ph.description.substring(0, 40) + '...'
              : ph.description;
            progressCallback(`🖼️ 이미지 생성 중 (${globalIdx + 1}/${placeholders.length}): ${desc}`);
          }

          const imgResult = await this.generateImage(ph.description);
          return { ph, imgResult, filename, globalIdx };
        })
      );
      results.push(...batchResults);
    }

    // 결과 적용
    let result = content;
    let generated = 0;
    let placeholderCount = 0;

    for (const r of results) {
      if (r.status === 'fulfilled') {
        const { ph, imgResult, filename, globalIdx } = r.value;
        if (imgResult.success) {
          let actualFilename = filename;
          if (imgResult.isPlaceholder) {
            actualFilename = filename.replace(/\.png$/, '.svg');
            placeholderCount++;
          } else {
            generated++;
          }

          const imgPath = join(imagesDir, actualFilename);
          await writeFile(imgPath, Buffer.from(imgResult.imageData, 'base64'));

          result = result.replace(ph.fullMatch, `![${ph.description}](images/${actualFilename})`);

          // 메타데이터 기록
          if (this._metaStore) {
            const buffer = Buffer.from(imgResult.imageData, 'base64');
            await this._metaStore.addImage({
              filename: actualFilename,
              chapter_id: chapterId,
              prompt: ph.description,
              provider: imgResult.provider,
              ai_model: imgResult.ai_model,
              resolution: this.resolution,
              file_size: buffer.length,
              width: imgResult.isPlaceholder ? 400 : null,
              height: imgResult.isPlaceholder ? 260 : null,
              status: imgResult.isPlaceholder ? 'placeholder' : 'generated',
              rating: null,
            });
          }
        } else {
          // 실패 시 플레이스홀더 유지
          console.warn(`[ImageGen] 이미지 생성 실패 (${ph.description.slice(0, 40)}): ${imgResult.error}`);
        }
      } else {
        console.warn(`[ImageGen] Promise 실패:`, r.reason?.message || r.reason);
      }
    }

    if (progressCallback) {
      const parts = [];
      if (generated > 0) parts.push(`${generated}장 AI 생성`);
      if (placeholderCount > 0) parts.push(`${placeholderCount}장 플레이스홀더`);
      const failed = placeholders.length - generated - placeholderCount;
      if (failed > 0) parts.push(`${failed}장 실패`);
      progressCallback(`🖼️ 이미지 처리 완료: ${parts.join(', ')}`);
    }

    return result;
  }

  // ============================================================
  // 메타데이터 조회 API
  // ============================================================

  /**
   * 프로젝트의 모든 이미지 메타데이터 조회
   */
  async listImages() {
    if (!this._metaStore) return [];
    return this._metaStore.getByProject();
  }

  /**
   * 특정 챕터의 이미지 메타데이터 조회
   */
  async listChapterImages(chapterId) {
    if (!this._metaStore) return [];
    return this._metaStore.getByChapter(chapterId);
  }

  /**
   * 이미지 평가 (1-5점)
   */
  async rateImage(imageId, rating) {
    if (!this._metaStore) return null;
    if (rating < 1 || rating > 5) throw new Error('평가 점수는 1~5 사이여야 합니다');
    return this._metaStore.updateRating(imageId, rating);
  }
}

// XML 특수문자 이스케이프 (SVG용)
function _escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
