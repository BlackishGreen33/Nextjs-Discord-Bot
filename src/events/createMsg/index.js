import { Events } from "discord.js";
import replayData from "@/store/replayData.json";
import sendData from "@/store/sendData.json";

export const event = {
  name: Events.MessageCreate,
};

const trytry = "907221563496099850";

export const action = (msg) => {
  if (msg.author.bot) return;
  let reply = findOutValue(replayData, msg.content);
  let send = findOutValue(sendData, msg.content);
  if (reply) {
    msg.reply(reply);
  }
  if (msg.content == "蔡蔡") {
    msg.reply(`<@${trytry}>` + " 要不要打mai");
  }
  if (send) {
    msg.send(send);
  }
};

function findOutValue(data, msg) {
  const match = data.find((item) => item.in === msg);
  return match ? match.out : null;
}
