import { SlashCommandBuilder } from 'discord.js';

export const command = new SlashCommandBuilder()
	.setName('ping')
	.setDescription('查看機器人延遲');

export const action = async (ctx) => {
	if (!ctx.isChatInputCommand()) return;
	if (ctx.commandName === 'ping') {
		const msg = await ctx.reply({
			content: "正在計算延遲......",
			fetchReply: true
		});
		const ping = msg.createdTimestamp - ctx.createdTimestamp;
		ctx.editReply(`機器人延遲：${ping} ms`)
	}
};