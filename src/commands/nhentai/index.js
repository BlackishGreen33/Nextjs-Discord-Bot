import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import request from "request";
import cheerio from "cheerio";

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
    const url = `https://nhentai.net/g/${number}`;
    const img = getImg(url);
    // const title = fetchH2Text(url);
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

const getImg = (url) => {
  request(url + "/1/", (error, response, body) => {
    if (!error && response.statusCode === 200) {
      const $ = cheerio.load(body);
      const src = $(".content #image-container a img").attr("src");
      console.log(body);
      return src;
    } else {
      console.error(error);
    }
  });
};
