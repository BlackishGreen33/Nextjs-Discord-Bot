import { SlashCommandBuilder } from "discord.js";

export const command = new SlashCommandBuilder()
  .setName("nhentai")
  .setDescription("查詢 nhentai 本子")
  .addStringOption((option) =>
    option.setName("num").setDescription("提供番號").setRequired(true)
  );

export const action = async (ctx) => {
  if (!ctx.isChatInputCommand()) return;
  if (ctx.commandName === "nhentai") {
    const number = ctx.options.getString("num").trim();
    ctx.reply(`https://nhentai.net/g/${number}`);
  }
};
