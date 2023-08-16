import { Client, Events, GatewayIntentBits } from "discord.js";
import vueInit from "@/core/vue";
import dotenv from "dotenv";
import { useAppStore } from "@/store/app";

import { loadCommands, loadEvents } from "@/core/loader";

vueInit();
dotenv.config();

loadCommands();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
const appStore = useAppStore();
appStore.client = client;

loadEvents();

client.login("MTExNDQxMDQ4MTIxNDU2NjQyMA.GheD27.dmoJgZ9oD7xCRrM4IdlabHrSgNlK8RuHqsuolo");
