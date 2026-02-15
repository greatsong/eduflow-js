import { create } from 'zustand';
import { apiFetch } from '../api/client';

const STORAGE_KEY = 'eduflow_current_project';

export const useProjectStore = create((set, get) => ({
  // 상태
  projects: [],
  currentProject: null,
  progress: null,
  loading: false,
  error: null,

  // 프로젝트 목록 로드
  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const projects = await apiFetch('/api/projects');
      set({ projects, loading: false });
    } catch (e) {
      set({ error: e.message, loading: false });
    }
  },

  // 프로젝트 선택
  selectProject: async (projectId) => {
    try {
      const project = await apiFetch(`/api/projects/${projectId}`);
      const progress = await apiFetch(`/api/projects/${projectId}/progress`);
      set({ currentProject: project, progress });
      localStorage.setItem(STORAGE_KEY, projectId);
    } catch (e) {
      set({ error: e.message });
    }
  },

  // 프로젝트 선택 해제
  clearProject: () => {
    set({ currentProject: null, progress: null });
    localStorage.removeItem(STORAGE_KEY);
  },

  // 앱 시작 시 localStorage에서 이전 선택 복원
  restoreProject: async () => {
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (!savedId) return;
    try {
      const project = await apiFetch(`/api/projects/${savedId}`);
      const progress = await apiFetch(`/api/projects/${savedId}/progress`);
      set({ currentProject: project, progress });
    } catch {
      // 프로젝트가 삭제되었으면 저장된 ID 제거
      localStorage.removeItem(STORAGE_KEY);
    }
  },

  // 진행 상태 새로고침
  refreshProgress: async () => {
    const { currentProject } = get();
    if (!currentProject) return;
    try {
      const progress = await apiFetch(`/api/projects/${currentProject.name}/progress`);
      set({ progress });
    } catch (e) {
      set({ error: e.message });
    }
  },
}));
