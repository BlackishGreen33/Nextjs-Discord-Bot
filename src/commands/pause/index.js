import { SlashCommandBuilder } from "discord.js";
import music from "@/utils/music";

export const command = new SlashCommandBuilder()
  .setName("pause")
  .setDescription("暫停音樂");

export const action = async (interaction) => {
  if (!ctx.isChatInputCommand()) return;
  if (ctx.commandName === "pause") {
    music.pause(interaction);
  }
};
