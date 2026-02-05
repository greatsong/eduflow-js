import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';

export class ConversationManager {
  constructor(projectPath, apiKey = null) {
    this.projectPath = projectPath;
    this.discussionsPath = join(projectPath, 'discussions');
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
  }

  async ensureDir() {
    if (!existsSync(this.discussionsPath)) {
      await mkdir(this.discussionsPath, { recursive: true });
    }
  }

  _conversationFile(step) {
    return join(this.discussionsPath, `step${step}_conversation.json`);
  }

  _summaryFile(step) {
    return join(this.discussionsPath, `step${step}_summary.md`);
  }

  async saveMessage(step, role, content) {
    await this.ensureDir();
    const filePath = this._conversationFile(step);

    let conversation;
    if (existsSync(filePath)) {
      conversation = JSON.parse(await readFile(filePath, 'utf-8'));
    } else {
      conversation = {
        step,
        created_at: new Date().toISOString(),
        messages: [],
      };
    }

    conversation.messages.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });
    conversation.updated_at = new Date().toISOString();

    await writeFile(filePath, JSON.stringify(conversation, null, 2), 'utf-8');
  }

  async loadConversation(step) {
    const filePath = this._conversationFile(step);
    if (!existsSync(filePath)) return [];

    const conversation = JSON.parse(await readFile(filePath, 'utf-8'));
    return (conversation.messages || []).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  async clearConversation(step) {
    const filePath = this._conversationFile(step);
    if (!existsSync(filePath)) return false;
    await unlink(filePath);
    return true;
  }

  async loadSummary(step) {
    const filePath = this._summaryFile(step);
    if (!existsSync(filePath)) return null;
    return readFile(filePath, 'utf-8');
  }

  /**
   * 대화를 요약하여 저장. SSE res 객체를 전달하면 스트리밍.
   */
  async summarizeConversation(step, model = 'claude-sonnet-4-20250514', res = null) {
    const messages = await this.loadConversation(step);
    if (!messages.length) return '대화 내용이 없습니다.';

    const conversationText = messages
      .map((m) => `**${m.role.toUpperCase()}**: ${m.content}`)
      .join('\n\n');

    const today = new Date().toISOString().split('T')[0];

    let prompt;
    if (step === '1') {
      prompt = `다음은 교육자료 제작 방향성 논의 내용입니다.
이 대화를 읽고 **책 컨셉(master-context)** 형식으로 정리해주세요.

# 출력 형식 (반드시 이 구조를 따르세요)

# [책 제목] - 마스터 컨텍스트

---

## 📘 프로젝트 개요

### 책 제목
**[책 제목]**

### 핵심 철학
**"[핵심 메시지 한 문장]"**
- [철학 포인트 1]
- [철학 포인트 2]
- [철학 포인트 3]

### 대상 독자
- [대상 설명]
- [대상 수준]

### 자료 성격
**[자료 성격 한 문장]**
- [특징 1]
- [특징 2]

---

## ✍️ 작성 원칙

### 설명 원칙
**3단계 설명법**:
1. 비유로 시작
2. 정확한 정의
3. 예시로 확인

---

## 📝 메모

[논의 중 나온 특별한 아이디어나 주의사항]

---

*마지막 업데이트: ${today}*

# 대화 내용
${conversationText}

# 책 컨셉 정리
`;
    } else {
      prompt = `다음은 교육자료 제작 논의 내용입니다.
이 대화를 읽고 핵심 내용을 마크다운 형식으로 정리해주세요.

# 요구사항
- 주요 결정사항
- 핵심 아이디어
- 합의된 방향성
- 다음 단계 액션 아이템

# 대화 내용
${conversationText}

# 정리된 요약
`;
    }

    const client = new Anthropic({ apiKey: this.apiKey });
    let summary = '';

    if (res) {
      // SSE 스트리밍 모드
      const stream = client.messages.stream({
        model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.text) {
          summary += event.delta.text;
          res.write(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`);
        }
      }
    } else {
      const response = await client.messages.create({
        model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });
      summary = response.content[0].text;
    }

    // 파일 저장
    await this.ensureDir();
    const summaryFile = this._summaryFile(step);

    if (step === '1') {
      await writeFile(summaryFile, summary, 'utf-8');
      await writeFile(join(this.projectPath, 'master-context.md'), summary, 'utf-8');
    } else {
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const content = `# Step ${step} 논의 요약\n\n**생성일시**: ${now}\n\n---\n\n${summary}`;
      await writeFile(summaryFile, content, 'utf-8');
    }

    return summary;
  }
}
