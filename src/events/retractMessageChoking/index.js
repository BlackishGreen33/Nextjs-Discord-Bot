import { Events } from "discord.js";

export const event = {
  name: Events.MessageDelete,
};

export const action = (msg) => {
    msg.send(`${msg.author.username} 抓到  還敢偷刪啊`);
    msg.send(`原訊息內容：${msg.content}`);
};