import { Events } from 'discord.js';

export const event = {
    name: Events.MessageCreate,
    once: false,
};

export const action = async (message) => {
    if (message.author.bot) return;
    if (message.content === '笑死') {
        message.reply('死好');
    }
};