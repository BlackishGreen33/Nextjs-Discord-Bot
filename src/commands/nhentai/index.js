import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { API, TagTypes } from "nhentai-api";

export const command = new SlashCommandBuilder()
  .setName("nhentai")
  .setDescription("查詢 nhentai 本子")
  .addStringOption((option) =>
    option.setName("num").setDescription("提供番號").setRequired(true)
  );

export const action = async (ctx) => {
  if (!ctx.isChatInputCommand()) return;
  if (ctx.commandName === "nhentai") {
    const api = new API();
    const number = ctx.options.getString("num").trim();
    const url = `https://nhentai.net/g/${number}`;
    let img = "";
    api.getBook(number).then((book) => {
      img = api.getImageURL(book.cover);
    });
    const embed = new EmbedBuilder()
      .setColor(0xed2553)
      .setTitle(url)
      .setURL(url)
      // .setAuthor({
      //   name: "Some name",
      //   iconURL: "https://i.imgur.com/AfFp7pu.png",
      //   url: "https://discord.js.org",
      // })
      .setDescription("Some description here")
      // .setThumbnail("https://i.imgur.com/AfFp7pu.png")
      // .addFields(
      //   { name: "Regular field title", value: "Some value here" },
      //   { name: "\u200B", value: "\u200B" },
      //   { name: "Inline field title", value: "Some value here", inline: true },
      //   { name: "Inline field title", value: "Some value here", inline: true }
      // )
      // .addFields({
      //   name: "Inline field title",
      //   value: "Some value here",
      //   inline: true,
      // })
      .setImage(img)
      .setTimestamp();
    // .setFooter({
    //   text: "Some footer text here",
    //   iconURL: "https://i.imgur.com/AfFp7pu.png",
    // });
    ctx.reply({ embeds: [embed] });
  }
};
