import { defineStore } from "pinia";

export const useAppStore = defineStore("app", {
  state: () => ({
    client: null,
    commandsActionMap: null,
  }),
  getters: {},
  actions: {},
});

export const usePreDelMsgStore = defineStore("preDelMsg", {
  state: () => {
    return {
      author: "",
      content: "",
    };
  },
});

export const usePreEditMsgStore = defineStore("preEditMsg", {
  state: () => {
    return {
      author: "",
      content: "",
    };
  },
});