import { Events } from "discord.js";

export const event = {
  name: Events.MessageDelete,
};

export const action = (msg) => {
    msg.channel.send(`${msg.author.username} 抓到  還敢偷刪啊`);
    msg.channel.send(`原訊息內容：${msg.content}`);
};