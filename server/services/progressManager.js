import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { withLock } from './fileLock.js';

export class ProgressManager {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.progressFile = join(projectPath, 'progress.json');
  }

  async _loadProgress() {
    if (!existsSync(this.progressFile)) {
      return this._initProgress();
    }
    const raw = await readFile(this.progressFile, 'utf-8');
    return JSON.parse(raw);
  }

  _initProgress() {
    return {
      project_created_at: new Date().toISOString(),
      step1_completed: false,
      step2_completed: false,
      step3_confirmed: false,
      chapters: {},
      last_updated: new Date().toISOString(),
    };
  }

  async _saveProgress(progress) {
    progress.last_updated = new Date().toISOString();
    await writeFile(this.progressFile, JSON.stringify(progress, null, 2), 'utf-8');
  }

  /** 읽기→수정→쓰기 전체를 뮤텍스로 감싸는 헬퍼 */
  async _updateProgress(mutator) {
    return withLock(this.progressFile, async () => {
      const progress = await this._loadProgress();
      mutator(progress);
      await this._saveProgress(progress);
      return progress;
    });
  }

  // 단계별 상태 관리

  async markStep1Completed() {
    await this._updateProgress(p => {
      p.step1_completed = true;
      p.step1_completed_at = new Date().toISOString();
    });
  }

  async markStep2Completed() {
    await this._updateProgress(p => {
      p.step2_completed = true;
      p.step2_completed_at = new Date().toISOString();
    });
  }

  async markStep3Confirmed() {
    await this._updateProgress(p => {
      p.step3_confirmed = true;
      p.step3_confirmed_at = new Date().toISOString();
    });
  }

  async isStep1Completed() {
    const progress = await this._loadProgress();
    return progress.step1_completed || false;
  }

  async isStep2Completed() {
    const progress = await this._loadProgress();
    return progress.step2_completed || false;
  }

  async isStep3Confirmed() {
    const progress = await this._loadProgress();
    return progress.step3_confirmed || false;
  }

  // 챕터 상태 관리

  async markChapterCompleted(chapterId) {
    await this._updateProgress(p => {
      if (!p.chapters) p.chapters = {};
      p.chapters[chapterId] = {
        status: 'completed',
        completed_at: new Date().toISOString(),
      };
    });
  }

  async markChapterInProgress(chapterId) {
    await this._updateProgress(p => {
      if (!p.chapters) p.chapters = {};
      if (p.chapters[chapterId]?.status === 'completed') return;
      p.chapters[chapterId] = {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      };
    });
  }

  async getChapterStatus(chapterId) {
    const progress = await this._loadProgress();
    return progress.chapters?.[chapterId]?.status || 'pending';
  }

  async getCompletedChapters() {
    const progress = await this._loadProgress();
    const chapters = progress.chapters || {};
    return Object.entries(chapters)
      .filter(([, info]) => info.status === 'completed')
      .map(([id]) => id);
  }

  async getChaptersSummary() {
    const progress = await this._loadProgress();
    const chapters = progress.chapters || {};
    const entries = Object.values(chapters);
    return {
      completed: entries.filter((i) => i.status === 'completed').length,
      in_progress: entries.filter((i) => i.status === 'in_progress').length,
      total: entries.length,
    };
  }

  // 전체 상태

  async getOverallStatus() {
    const progress = await this._loadProgress();
    const summary = await this.getChaptersSummary();
    // step4: 1개 이상 챕터 완료 시
    const step4Done = summary.completed > 0;
    // step5: mkdocs.yml 존재 시 (빌드 완료)
    const step5Done = existsSync(join(this.projectPath, 'mkdocs.yml'));
    return {
      project_created: true, // 프로젝트가 존재하면 항상 true
      step1_completed: progress.step1_completed || false,
      step2_completed: progress.step2_completed || false,
      step3_confirmed: progress.step3_confirmed || false,
      step4_completed: step4Done,
      step5_completed: step5Done,
      chapters_completed: summary.completed,
      chapters_in_progress: summary.in_progress,
      chapters_total: summary.total,
      last_updated: progress.last_updated || '',
    };
  }

  async resetProgress() {
    const progress = this._initProgress();
    await this._saveProgress(progress);
  }

  hasExistingProgress() {
    return existsSync(this.progressFile);
  }

  async canResumeFrom() {
    const progress = await this._loadProgress();
    if (!progress.step1_completed) {
      if (existsSync(join(this.projectPath, 'master-context.md'))) return 'step1';
      return null;
    }
    if (!progress.step2_completed) return 'step2';
    if (!progress.step3_confirmed) return 'step3';
    return 'step4';
  }
}
