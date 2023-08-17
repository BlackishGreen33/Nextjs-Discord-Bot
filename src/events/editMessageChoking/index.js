import { Events } from "discord.js";

export const event = {
  name: Events.MessageUpdate,
};

export const action = (msg) => {
    msg.reply("抓到  還敢收回啊");
    msg.reply(`原訊息內容：${msg.content}`);
};