import { Events } from "discord.js";

export const event = {
  name: Events.MessageUpdate,
};

export const action = (msg) => {
  if (msg.author.bot) return;
  msg.reply("抓到  還敢收回啊");
  msg.reply(`原訊息內容：${msg.content}`);
};
