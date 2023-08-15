import { Events } from "discord.js";
import jsonData from "./data.json";

export const event = {
  name: Events.MessageCreate,
};

export const action = (msg) => {
  if (msg.author.bot) return;
  let outputValue = findOutValue(jsonData, msg.content);
  if (outputValue) {
    msg.reply(outputValue);
  }
};

function findOutValue(data, msg) {
  const match = data.find((item) => item.in === msg);
  return match ? match.out : null;
}
