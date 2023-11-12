import { SlashCommandBuilder } from "discord.js";

export const command = new SlashCommandBuilder()
  .setName("wnacg")
  .setDescription("查詢 wnacg 本子")
  .addStringOption((option) =>
    option.setName("num").setDescription("提供番號").setRequired(true)
  );

export const action = async (ctx) => {
  if (!ctx.isChatInputCommand()) return;
  if (ctx.commandName === "wnacg") {
    const number = ctx.options.getString("num").trim();
    ctx.reply(`https://wnacg.com/photos-slide-aid-${number}.html`);
  }
};
