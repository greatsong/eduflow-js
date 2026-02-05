import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

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

  // 단계별 상태 관리

  async markStep1Completed() {
    const progress = await this._loadProgress();
    progress.step1_completed = true;
    progress.step1_completed_at = new Date().toISOString();
    await this._saveProgress(progress);
  }

  async markStep2Completed() {
    const progress = await this._loadProgress();
    progress.step2_completed = true;
    progress.step2_completed_at = new Date().toISOString();
    await this._saveProgress(progress);
  }

  async markStep3Confirmed() {
    const progress = await this._loadProgress();
    progress.step3_confirmed = true;
    progress.step3_confirmed_at = new Date().toISOString();
    await this._saveProgress(progress);
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
    const progress = await this._loadProgress();
    if (!progress.chapters) progress.chapters = {};
    progress.chapters[chapterId] = {
      status: 'completed',
      completed_at: new Date().toISOString(),
    };
    await this._saveProgress(progress);
  }

  async markChapterInProgress(chapterId) {
    const progress = await this._loadProgress();
    if (!progress.chapters) progress.chapters = {};
    if (progress.chapters[chapterId]?.status === 'completed') return;
    progress.chapters[chapterId] = {
      status: 'in_progress',
      started_at: new Date().toISOString(),
    };
    await this._saveProgress(progress);
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
    return {
      step1_completed: progress.step1_completed || false,
      step2_completed: progress.step2_completed || false,
      step3_confirmed: progress.step3_confirmed || false,
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
