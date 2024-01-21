import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

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
      .setImage(url + "/1/")
      .setTimestamp();
    // .setFooter({
    //   text: "Some footer text here",
    //   iconURL: "https://i.imgur.com/AfFp7pu.png",
    // });
    ctx.reply({ embeds: [embed] });
  }
};

// const fetchH2Text = async (url) => {
//   try {
//     const response = await fetch(url);
//     if (response.ok) {
//       const htmlContent = await response.text();
//       return parseHTML(htmlContent);
//     } else {
//       throw new Error("error");
//     }
//   } catch (error) {
//     console.log(error.message);
//   }
// };

// const parseHTML = (htmlContent) => {
//   const div = document.createElement("div");
//   div.innerHTML = htmlContent;
//   const h2Element = div.querySelector("h2");
//   return h2Element.textContent;
// };
