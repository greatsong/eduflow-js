/**
 * Gemini 이미지 생성 서비스
 *
 * 교재 챕터 생성 시 이미지 플레이스홀더(<!-- IMAGE: ... -->)를 감지하여
 * Gemini API로 자동 생성하고, docs/images/ 에 저장한 뒤
 * 마크다운의 플레이스홀더를 실제 이미지 경로로 교체
 */
import { GoogleGenAI } from '@google/genai';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// 이미지 플레이스홀더 정규식: <!-- IMAGE: 설명 텍스트 -->
const PLACEHOLDER_REGEX = /<!-- IMAGE: (.+?) -->/g;

const IMAGE_MODELS = [
  'gemini-3.1-flash-image-preview',              // Nano Banana 2 (이전 성공 모델)
  'gemini-2.5-flash-preview-image-generation',   // Nano Banana (폴백)
  'gemini-2.0-flash-preview-image-generation',   // 폴백 2
];

// 병렬 생성 동시 요청 수 (API 레이트 리밋 고려)
const MAX_CONCURRENT = 3;

export class ImageGenerator {
  /**
   * @param {string} apiKey - Google API 키
   * @param {string} [model] - 사용할 모델
   * @param {object} [usageTracker] - { record(data) } 토큰 사용량 기록기
   * @param {object} [userInfo] - { userId, userName, userEmail, projectId }
   */
  /**
   * @param {string} apiKey - Google API 키
   * @param {string} [model] - 사용할 모델
   * @param {object} [usageTracker] - { record(data) } 토큰 사용량 기록기
   * @param {object} [userInfo] - { userId, userName, userEmail, projectId }
   * @param {string} [styleGuide] - 사용자 작성 이미지 스타일 가이드라인
   */
  constructor(apiKey, model = IMAGE_MODELS[0], usageTracker = null, userInfo = {}, styleGuide = '') {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
    this.usageTracker = usageTracker;
    this.userInfo = userInfo;
    this.styleGuide = styleGuide;
  }

  _recordUsage(modelUsed, success) {
    if (!this.usageTracker) return;
    try {
      this.usageTracker.record({
        ...this.userInfo,
        action: 'image-generation',
        provider: 'google',
        model: modelUsed,
        inputTokens: 0,
        outputTokens: 0,
        imageCount: success ? 1 : 0,
        keySource: 'server',
      });
    } catch { /* fire-and-forget */ }
  }

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
   * 교육용 이미지 프롬프트를 정교하게 구성
   */
  _buildPrompt(description) {
    const base = [
      `Create an educational illustration for a textbook.`,
      ``,
      `Subject: ${description}`,
      ``,
      `Style:`,
      `- Warm-toned animation style illustration (애니메이션 스타일)`,
      `- Friendly, approachable characters and objects`,
      `- Soft pastel color palette with warm highlights`,
      `- Clean lines with gentle shading and soft gradients`,
      ``,
      `Requirements:`,
      `- Clear visual hierarchy: main subject prominent`,
      `- Label key components in Korean if the description is in Korean`,
      `- Light, warm background`,
      `- Every element serves an educational purpose — no clutter`,
      `- Suitable for high school to university students`,
      `- No watermarks, signatures, or attribution text`,
      `- If showing a process: use arrows, numbered steps, clear flow`,
      `- Landscape orientation (wider than tall)`,
    ];

    // 사용자 가이드라인이 있으면 추가
    if (this.styleGuide) {
      base.push('');
      base.push('Additional style guide from the author:');
      base.push(this.styleGuide);
    }

    return base.join('\n');
  }

  async generateImage(description, options = {}) {
    const {
      aspectRatio = '3:2',
      imageSize = '1K',
    } = options;

    const prompt = this._buildPrompt(description);

    // 모델 폴백: 첫 번째 모델 실패 시 다음 모델로 시도
    const modelsToTry = [this.model, ...IMAGE_MODELS.filter(m => m !== this.model)];

    for (const modelName of modelsToTry) {
      try {
        const response = await this.client.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: { aspectRatio, imageSize },
          },
        });

        if (response.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
              console.log(`이미지 생성 성공 (모델: ${modelName})`);
              this._recordUsage(modelName, true);
              return {
                success: true,
                imageData: part.inlineData.data,
                mimeType: part.inlineData.mimeType || 'image/png',
              };
            }
          }
        }
      } catch (error) {
        console.error(`이미지 생성 실패 (${modelName}):`, error.message);
        this._recordUsage(modelName, false);
        continue;
      }
    }

    // 모든 모델 시도 실패 시 명시적 에러 반환 (BUG-008)
    return { success: false, error: '모든 이미지 생성 모델이 실패했습니다', triedModels: modelsToTry };
  }

  /**
   * 챕터 마크다운의 플레이스홀더를 실제 이미지로 교체 (병렬 생성)
   */
  async processChapterImages(markdown, docsPath, chapterId, progressCallback = null) {
    const placeholders = this.findPlaceholders(markdown);
    if (placeholders.length === 0) return markdown;

    const imagesDir = join(docsPath, 'images');
    if (!existsSync(imagesDir)) {
      await mkdir(imagesDir, { recursive: true });
    }

    if (progressCallback) {
      progressCallback(`🖼️ 이미지 ${placeholders.length}장 병렬 생성 시작...`);
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
    let result = markdown;
    let generated = 0;

    for (const r of results) {
      if (r.status === 'fulfilled') {
        const { ph, imgResult, filename } = r.value;
        if (imgResult.success) {
          const imgPath = join(imagesDir, filename);
          await writeFile(imgPath, Buffer.from(imgResult.imageData, 'base64'));
          result = result.replace(ph.fullMatch, `![${ph.description}](images/${filename})`);
          generated++;
        } else {
          // 실패 시 플레이스홀더 유지 → 챕터 편집에서 재생성 가능
          // (오류 메시지를 챕터 내용에 넣지 않음)
          console.warn(`이미지 생성 실패 (${ph.description.slice(0, 40)}): ${imgResult.error}`);
        }
      } else {
        // Promise rejected — 플레이스홀더 유지
        console.warn(`이미지 생성 Promise 실패:`, r.reason?.message || r.reason);
      }
    }

    if (progressCallback) {
      progressCallback(`🖼️ 이미지 생성 완료: ${generated}/${placeholders.length}장 성공`);
    }

    return result;
  }

  /**
   * 단일 이미지 재생성 (기존 파일 덮어쓰기)
   */
  async generateSingle(description, filename, docsPath) {
    const imagesDir = join(docsPath, 'images');
    if (!existsSync(imagesDir)) {
      await mkdir(imagesDir, { recursive: true });
    }

    const imgResult = await this.generateImage(description);
    if (!imgResult.success) {
      return { success: false, error: imgResult.error };
    }

    const buffer = Buffer.from(imgResult.imageData, 'base64');
    await writeFile(join(imagesDir, filename), buffer);
    return { success: true, filename, size: buffer.length };
  }
}
