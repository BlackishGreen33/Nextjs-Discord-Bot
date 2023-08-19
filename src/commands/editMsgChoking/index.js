import { SlashCommandBuilder } from "discord.js";
import { usePreEditMsgStore } from "@/store/app";

const store = usePreEditMsgStore;

export const command = new SlashCommandBuilder()
  .setName("還敢偷改啊")
  .setDescription("查看上一條被修改的訊息");

export const action = async (ctx) => {
  if (!ctx.isChatInputCommand()) return;
  if (ctx.commandName === "還敢偷改啊") {
    ctx.channel.send(`${store.author} 抓到  還敢偷改啊\n`+`原訊息內容：${store.content}`);
  }
};
