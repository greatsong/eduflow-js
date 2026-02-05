import { create } from 'zustand';
import { apiFetch } from '../api/client';

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
    } catch (e) {
      set({ error: e.message });
    }
  },

  // 프로젝트 선택 해제
  clearProject: () => set({ currentProject: null, progress: null }),

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
