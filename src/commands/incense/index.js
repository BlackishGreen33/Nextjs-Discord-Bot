import { SlashCommandBuilder } from 'discord.js';

export const command = new SlashCommandBuilder()
	.setName('上香')
	.setDescription('傳送上香 GIF');

export const action = async (ctx) => {
	if (!ctx.isChatInputCommand()) return;
	if (ctx.commandName === '上香') {
		msg.channel.send("https://media.discordapp.net/attachments/1043421603695960114/1043421760634228817/2pK5nLt.gif");
	}
};