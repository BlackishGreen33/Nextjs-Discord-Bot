import { SlashCommandBuilder } from "discord.js";
import music from "@/utils/music";

export const command = new SlashCommandBuilder()
  .setName("resume")
  .setDescription("恢復播放");

export const action = async (interaction) => {
  if (!ctx.isChatInputCommand()) return;
  if (ctx.commandName === "resume") {
    music.resume(interaction);
  }
};
