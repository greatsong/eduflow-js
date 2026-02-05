import { readFile, writeFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
      await writeFile(templateInfoFile, JSON.stringify({
        template_id: templateId,
        template_name: template.name,
        toc_prompt_addition: template.toc_prompt_addition || '',
        chapter_prompt_addition: template.chapter_prompt_addition || '',
      }, null, 2), 'utf-8');

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
    if (!existsSync(filePath)) return '';
    try {
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw).chapter_prompt_addition || '';
    } catch {
      return '';
    }
  }
}
