import { SlashCommandBuilder } from "discord.js";
import music from "@/utils/music";

export const command = new SlashCommandBuilder()
  .setName("skip")
  .setDescription("跳過歌曲");

export const action = async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "skip") {
    music.skip(interaction);
  }
};
