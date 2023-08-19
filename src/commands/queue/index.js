import { SlashCommandBuilder } from "discord.js";
import music from "@/utils/music";

export const command = new SlashCommandBuilder()
  .setName("queue")
  .setDescription("查看歌曲隊列");

export const action = async (interaction) => {
  if (!ctx.isChatInputCommand()) return;
  if (ctx.commandName === "queue") {
    music.nowQueue(interaction);
  }
};
