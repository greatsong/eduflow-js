import { create } from 'zustand';

export const useChatStore = create((set) => ({
  messages: [],
  isStreaming: false,

  setMessages: (messages) => set({ messages }),

  addMessage: (role, content) =>
    set((s) => ({ messages: [...s.messages, { role, content }] })),

  appendToLastMessage: (text) =>
    set((s) => {
      const msgs = [...s.messages];
      if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
        msgs[msgs.length - 1] = {
          ...msgs[msgs.length - 1],
          content: msgs[msgs.length - 1].content + text,
        };
      }
      return { messages: msgs };
    }),

  setStreaming: (v) => set({ isStreaming: v }),

  clearMessages: () => set({ messages: [] }),
}));
