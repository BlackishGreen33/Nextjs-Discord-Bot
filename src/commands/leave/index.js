import { SlashCommandBuilder } from "discord.js";
import music from "@/utils/music";

export const command = new SlashCommandBuilder()
  .setName("leave")
  .setDescription("讓機器人離開語音頻道（會清空歌曲隊列）");

export const action = async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "leave") {
    music.leave(interaction);
  }
};
