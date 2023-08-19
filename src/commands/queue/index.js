import { SlashCommandBuilder } from "discord.js";
import music from "@/utils/music";

export const command = new SlashCommandBuilder()
  .setName("queue")
  .setDescription("查看歌曲隊列");

export const action = async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "queue") {
    music.nowQueue(interaction);
  }
};
