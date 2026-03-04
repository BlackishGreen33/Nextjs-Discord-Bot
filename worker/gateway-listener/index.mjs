import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
} from 'discord.js';

const token = process.env.DISCORD_GATEWAY_TOKEN ?? process.env.BOT_TOKEN;

if (!token) {
  throw new Error('DISCORD_GATEWAY_TOKEN or BOT_TOKEN is required');
}

const allowedDomains = (process.env.MEDIA_ALLOWED_DOMAINS ?? 'x.com,twitter.com')
  .split(',')
  .map((domain) => domain.trim().toLowerCase())
  .filter((domain) => domain.length > 0);

const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

const createCustomId = (action, ownerId) => `dl:v1:${action}:${ownerId}`;

const normalizeUrl = (value) => {
  try {
    const parsed = new URL(value);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }

    const normalizedHost = parsed.hostname.toLowerCase();

    const supported = allowedDomains.some(
      (domain) =>
        normalizedHost === domain || normalizedHost.endsWith(`.${domain}`)
    );

    if (!supported) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
};

const extractFirstSupportedUrl = (content) => {
  const candidates = content.match(URL_REGEX) ?? [];

  for (const candidate of candidates) {
    const normalized = normalizeUrl(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const inferPlatform = (sourceUrl) => {
  const hostname = new URL(sourceUrl).hostname.toLowerCase();

  if (hostname.includes('x.com') || hostname.includes('twitter.com')) {
    return 'Twitter';
  }

  if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
    return 'YouTube';
  }

  if (hostname.includes('instagram.com')) {
    return 'Instagram';
  }

  if (hostname.includes('facebook.com') || hostname.includes('fb.watch')) {
    return 'Facebook';
  }

  return hostname;
};

const fetchPreview = async (sourceUrl) => {
  const workerBaseUrl = process.env.MEDIA_WORKER_BASE_URL?.trim();

  if (!workerBaseUrl) {
    return {
      authorHandle: null,
      authorName: null,
      likes: null,
      platform: inferPlatform(sourceUrl),
      publishedAt: null,
      replies: null,
      reposts: null,
      sourceUrl,
      text: null,
      thumbnailUrl: null,
      title: null,
    };
  }

  const response = await fetch(`${workerBaseUrl}/v1/preview`, {
    body: JSON.stringify({ sourceUrl }),
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.MEDIA_WORKER_TOKEN
        ? {
            Authorization: `Bearer ${process.env.MEDIA_WORKER_TOKEN}`,
          }
        : {}),
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`preview request failed: ${response.status}`);
  }

  return response.json();
};

const buildEmbed = (preview, sourceUrl) => {
  const authorName =
    preview.authorName || preview.authorHandle
      ? `${preview.authorName ?? ''} ${preview.authorHandle ?? ''}`.trim()
      : 'Unknown author';

  const embed = new EmbedBuilder()
    .setColor(0x1d9bf0)
    .setAuthor({ name: `${preview.platform ?? 'Media'} | ${authorName}` })
    .setDescription(preview.text ?? 'No description available.')
    .setURL(sourceUrl)
    .setTitle(preview.title ?? `${preview.platform ?? 'Media'} post`)
    .setFooter({
      text: preview.publishedAt
        ? `Published: ${preview.publishedAt}`
        : 'Published: Unknown time',
    })
    .addFields(
      {
        inline: true,
        name: 'Replies',
        value:
          typeof preview.replies === 'number' ? `${preview.replies}` : '-',
      },
      {
        inline: true,
        name: 'Reposts',
        value:
          typeof preview.reposts === 'number' ? `${preview.reposts}` : '-',
      },
      {
        inline: true,
        name: 'Likes',
        value: typeof preview.likes === 'number' ? `${preview.likes}` : '-',
      }
    );

  if (typeof preview.thumbnailUrl === 'string' && preview.thumbnailUrl.length > 0) {
    embed.setImage(preview.thumbnailUrl);
  }

  return embed;
};

const buildButtons = (ownerId) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(createCustomId('video', ownerId))
      .setLabel('Download Video')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(createCustomId('audio', ownerId))
      .setLabel('Download Audio')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(createCustomId('delete', ownerId))
      .setLabel('Delete')
      .setStyle(ButtonStyle.Danger)
  );

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on('ready', () => {
  console.log(`[gateway-listener] logged in as ${client.user?.tag ?? 'unknown'}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) {
    return;
  }

  if (!message.guildId) {
    return;
  }

  const sourceUrl = extractFirstSupportedUrl(message.content);

  if (!sourceUrl) {
    return;
  }

  try {
    const preview = await fetchPreview(sourceUrl);
    const embed = buildEmbed(preview, sourceUrl);

    await message.reply({
      components: [buildButtons(message.author.id)],
      content: sourceUrl,
      embeds: [embed],
      failIfNotExists: false,
    });
  } catch (error) {
    const maybeError = error;
    console.error('[gateway-listener] failed to create card', maybeError);
  }
});

client.login(token);
