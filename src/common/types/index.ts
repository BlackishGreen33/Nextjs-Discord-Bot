import type {
  APIApplicationCommandInteraction,
  APIInteractionResponse,
} from 'discord.js';

export type executeCommand = (
  interaction: APIApplicationCommandInteraction
) => Promise<APIInteractionResponse>;
