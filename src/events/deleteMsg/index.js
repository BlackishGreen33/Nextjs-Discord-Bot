import { Events } from "discord.js";
import { usePreDelMsgStore } from "@/store/app";

const store = usePreDelMsgStore;

export const event = {
  name: Events.MessageDelete,
};

export const action = (msg) => {
  if (msg.author.bot) return;
  store.author = msg.author.username;
  store.content = msg.content;
};
