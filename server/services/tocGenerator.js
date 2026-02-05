import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { TemplateManager } from './templateManager.js';
import { ReferenceManager } from './referenceManager.js';

export class TOCGenerator {
  constructor(projectPath, apiKey = null) {
    this.projectPath = projectPath;
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
  }

  /**
   * 목차 자동 생성 (SSE 스트리밍 지원)
   */
  async generate(references, directionSummary, model = 'claude-opus-4-5-20251101', maxTokens = 16384, res = null) {
    const referencesText = references
      .map((ref, i) => `[참고자료 ${i + 1}]\n${ref}`)
      .join('\n\n---\n\n');

    // 템플릿 프롬프트 추가
    const tm = new TemplateManager();
    const templateAddition = await tm.getTocPromptAddition(this.projectPath);

    const prompt = `당신은 교육 커리큘럼 설계 전문가입니다.

다음 정보를 바탕으로 교육자료의 목차를 작성해주세요.

# 방향성 논의 요약
${directionSummary}

# 참고자료
${referencesText}

# 요구사항
1. 고등학생 눈높이에 맞는 체계적인 커리큘럼
2. 각 Part는 3-8개의 Chapter로 구성
3. 각 Chapter는 명확한 학습 목표 3개와 간결한 개요 포함 (개요는 1-2문단만)
4. 실습 위주, 점진적 난이도 상승

# 출력 형식 (JSON)
다음 JSON 형식으로 답변해주세요:

{
  "title": "교육자료 제목",
  "description": "전체 설명 (1-2문장)",
  "target_audience": "대상",
  "parts": [
    {
      "part_number": 1,
      "part_title": "Part 제목",
      "part_description": "Part 설명 (1문장)",
      "chapters": [
        {
          "chapter_id": "chapter01",
          "chapter_number": 1,
          "chapter_title": "챕터 제목",
          "learning_objectives": ["목표1", "목표2", "목표3"],
          "outline": "챕터 개요 (1-2문단, 간결하게)",
          "estimated_time": "2시간"
        }
      ]
    }
  ]
}

**중요**:
- outline은 3-5문장으로 작성 (핵심 내용, 활동, 학습 포인트 포함)
- JSON만 출력하고 다른 설명은 넣지 마세요
- 모든 문자열을 반드시 닫아주세요. JSON이 중간에 끊기지 않도록 주의하세요
- 챕터가 15개를 초과할 경우, Part를 권 단위로 묶어 분리하세요:
  - 예: Part 1~3은 1권, Part 4~6은 2권
  - Part의 part_title에 "[1권]", "[2권]" 등을 접두어로 붙이세요
  - 각 권은 이전 권의 내용을 이어서 연속적으로 학습하는 구조입니다
- 전체 JSON 응답이 반드시 완전한 형태로 끝나야 합니다
${templateAddition}
`;

    const client = new Anthropic({ apiKey: this.apiKey });
    let responseText = '';
    let stopReason = null;

    if (res) {
      // SSE 스트리밍 모드
      const stream = client.messages.stream({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.text) {
          responseText += event.delta.text;
          res.write(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`);
        }
      }

      const finalMessage = await stream.finalMessage();
      stopReason = finalMessage.stop_reason;
    } else {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });
      responseText = response.content[0].text;
      stopReason = response.stop_reason;
    }

    // 토큰 제한 확인
    if (stopReason === 'max_tokens') {
      const errorFile = join(this.projectPath, 'toc_generation_error.txt');
      await writeFile(errorFile,
        `=== Claude 원본 응답 (잘림) ===\n\n${responseText}\n\n=== 에러 ===\n\n응답이 max_tokens(${maxTokens}) 제한으로 잘렸습니다.`,
        'utf-8'
      );
      throw new Error(
        `응답이 토큰 제한(${maxTokens})으로 잘렸습니다. 챕터 수가 너무 많으면 outline을 더 간결하게 하거나, max_tokens를 늘려주세요.`
      );
    }

    // JSON 추출
    let jsonText = responseText;
    if (jsonText.includes('```json')) {
      const start = jsonText.indexOf('```json') + 7;
      const end = jsonText.indexOf('```', start);
      jsonText = jsonText.slice(start, end).trim();
    } else if (jsonText.includes('```')) {
      const start = jsonText.indexOf('```') + 3;
      const end = jsonText.indexOf('```', start);
      jsonText = jsonText.slice(start, end).trim();
    }

    let tocData;
    try {
      tocData = JSON.parse(jsonText);
    } catch (e) {
      const errorFile = join(this.projectPath, 'toc_generation_error.txt');
      await writeFile(errorFile,
        `=== Claude 원본 응답 ===\n\n${responseText}\n\n=== 추출 시도된 JSON ===\n\n${jsonText}\n\n=== 에러 ===\n\n${e.message}`,
        'utf-8'
      );
      throw new Error(`JSON 파싱 실패: ${e.message}\n원본 응답이 toc_generation_error.txt에 저장되었습니다.`);
    }

    tocData.generated_at = new Date().toISOString();
    tocData.model = model;

    return tocData;
  }

  /**
   * 목차 저장 (JSON + MD + master-toc.md)
   */
  async saveToc(tocData) {
    await writeFile(
      join(this.projectPath, 'toc.json'),
      JSON.stringify(tocData, null, 2),
      'utf-8'
    );

    await writeFile(
      join(this.projectPath, 'toc.md'),
      this._generateMarkdown(tocData),
      'utf-8'
    );

    await writeFile(
      join(this.projectPath, 'master-toc.md'),
      this._generateMasterToc(tocData),
      'utf-8'
    );
  }

  _generateMarkdown(tocData) {
    let md = `# ${tocData.title}\n\n`;
    md += `> ${tocData.description || ''}\n\n`;
    md += `**대상**: ${tocData.target_audience || ''}\n\n`;
    md += '---\n\n';

    for (const part of tocData.parts || []) {
      md += `## Part ${part.part_number}: ${part.part_title}\n\n`;
      md += `${part.part_description || ''}\n\n`;

      for (const ch of part.chapters || []) {
        md += `### ${ch.chapter_id}: ${ch.chapter_title}\n\n`;
        md += '**학습 목표**:\n';
        for (const obj of ch.learning_objectives || []) {
          md += `- ${obj}\n`;
        }
        md += `\n**개요**: ${ch.outline || ''}\n\n`;
        md += `**예상 시간**: ${ch.estimated_time || '-'}\n\n`;
      }
      md += '---\n\n';
    }
    return md;
  }

  _generateMasterToc(tocData) {
    const now = new Date();
    let md = `# ${tocData.title} - 최종 목차\n\n`;
    md += '---\n\n';
    md += `**생성일시**: ${now.toISOString().replace('T', ' ').slice(0, 19)}\n\n`;
    md += `**설명**: ${tocData.description || ''}\n\n`;
    md += `**대상 독자**: ${tocData.target_audience || ''}\n\n`;
    md += '---\n\n';

    let totalChapters = 0;
    let totalTime = 0;
    for (const part of tocData.parts || []) {
      for (const ch of part.chapters || []) {
        totalChapters++;
        const match = (ch.estimated_time || '').match(/(\d+)/);
        if (match) totalTime += parseInt(match[1], 10);
      }
    }

    md += `## 전체 개요 (${totalChapters} Chapters, ${totalTime}H)\n\n`;

    for (const part of tocData.parts || []) {
      let partTime = 0;
      for (const ch of part.chapters || []) {
        const match = (ch.estimated_time || '').match(/(\d+)/);
        if (match) partTime += parseInt(match[1], 10);
      }

      md += `### Part ${part.part_number}: ${part.part_title} (${partTime}H)\n\n`;
      md += `${part.part_description || ''}\n\n`;
      md += '| Ch | 제목 | 시간 | 상태 |\n';
      md += '|----|------|------|------|\n';

      for (const ch of part.chapters || []) {
        md += `| ${ch.chapter_number || '-'} | ${ch.chapter_title} | ${ch.estimated_time || '-'} | ⬜ |\n`;
      }
      md += '\n';
    }

    md += '---\n\n';
    md += `*마지막 업데이트: ${now.toISOString().split('T')[0]}*\n`;
    return md;
  }

  /**
   * 챕터별 아웃라인 파일 생성
   */
  async generateOutlines(tocData) {
    const outlinesPath = join(this.projectPath, 'outlines');
    if (!existsSync(outlinesPath)) {
      await mkdir(outlinesPath, { recursive: true });
    }

    for (const part of tocData.parts || []) {
      for (const ch of part.chapters || []) {
        let content = `# ${ch.chapter_title}\n\n`;
        content += `**Part ${part.part_number}**: ${part.part_title}\n\n`;
        content += '---\n\n';
        content += '## 학습 목표\n\n';
        for (const obj of ch.learning_objectives || []) {
          content += `- [ ] ${obj}\n`;
        }
        content += '\n## 개요\n\n';
        content += `${ch.outline || ''}\n\n`;
        content += '## 예상 소요 시간\n\n';
        content += `${ch.estimated_time || '-'}\n\n`;
        content += '---\n\n';
        content += '## 상세 내용 (챕터 생성 시 작성됨)\n\n';
        content += '이 섹션은 자동 생성 시 채워집니다.\n';

        await writeFile(join(outlinesPath, `${ch.chapter_id}.md`), content, 'utf-8');
      }
    }
  }

  /**
   * 저장된 목차 로드
   */
  async loadToc() {
    const jsonPath = join(this.projectPath, 'toc.json');
    if (!existsSync(jsonPath)) return null;
    return JSON.parse(await readFile(jsonPath, 'utf-8'));
  }
}
