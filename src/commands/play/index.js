import { SlashCommandBuilder } from "discord.js";
import music from "@/utils/music";

export const command = new SlashCommandBuilder()
  .setName("play")
  .setDescription("播放音樂")
  .addStringOption((option) =>
    option.setName("url").setDescription("提供 YouTube URL").setRequired(true)
  );

export const action = async (interaction) => {
  if (!ctx.isChatInputCommand()) return;
  if (ctx.commandName === "play") {
    await music.play(interaction);
  }
};
