import { Events } from "discord.js";

export const event = {
  name: Events.ClientReady,
  once: true,
};

export const action = (c) => {
  console.log(`啟動! 機器人 ${c.user.tag} 已上線`);
};
