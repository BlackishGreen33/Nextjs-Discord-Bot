import { SlashCommandBuilder } from "discord.js";
import music from "@/utils/music";

export const command = new SlashCommandBuilder()
  .setName("deleteplaylist")
  .setDescription("刪除播放清單中的歌曲")
  .addStringOption((option) =>
    option
      .setName("id")
      .setDescription("提供播放清單的 ID 識別碼")
      .setRequired(true)
  );

export const action = async (interaction) => {
  if (!ctx.isChatInputCommand()) return;
  if (ctx.commandName === "deleteplaylist") {
    music.deletePlayList(interaction);
  }
};
