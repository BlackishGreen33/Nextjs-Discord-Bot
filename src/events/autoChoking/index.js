import { Events } from "discord.js";
import jsonData from "./data.json";

export const event = {
  name: Events.MessageCreate,
};

const trytry = "907221563496099850";

export const action = (msg) => {
  if (msg.author.bot) return;
  let outputValue = findOutValue(jsonData, msg.content);
  if (outputValue) {
    msg.reply(outputValue);
  }
  if (msg.content == "蔡蔡") {
    msg.reply(`<@${trytry}>` + " 要不要打mai");
  }
};

function findOutValue(data, msg) {
  const match = data.find((item) => item.in === msg);
  return match ? match.out : null;
}
