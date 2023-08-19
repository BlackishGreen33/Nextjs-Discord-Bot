import { SlashCommandBuilder } from "discord.js";
import { usePreDelMsgStore } from "@/store/app";

const store = usePreDelMsgStore;

export const command = new SlashCommandBuilder()
  .setName("還敢偷刪啊")
  .setDescription("查看上一條被刪除的訊息");

export const action = async (ctx) => {
  if (!ctx.isChatInputCommand()) return;
  if (ctx.commandName === "還敢偷刪啊") {
    ctx.channel.send(`${store.author} 抓到  還敢偷刪啊\n`+`原訊息內容：${store.content}`);
  }
};
