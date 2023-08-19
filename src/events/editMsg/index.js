import { Events } from "discord.js";
import { usePreEditMsgStore } from "@/store/app";

const store = usePreEditMsgStore;

export const event = {
  name: Events.MessageUpdate,
};

export const action = (msg) => {
  if (msg.author.bot) return;
  store.author = msg.author.id;
  store.content = msg.content;
};
