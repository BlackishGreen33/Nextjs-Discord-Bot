import { APIInteractionResponse, InteractionType } from 'discord-api-types/v10';
import { NextResponse } from 'next/server';

import { PUBLIC_KEY } from '@/common/configs';
import { getCommands, verifyInteractionRequest } from '@/common/utils';

export async function POST(req: Request) {
  const ephemeralError = (content: string) =>
    NextResponse.json({
      type: 4,
      data: {
        content,
        flags: 64,
      },
    } satisfies APIInteractionResponse);

  try {
    const verifyRes = await verifyInteractionRequest(req, PUBLIC_KEY);

    if (!verifyRes.isValid || !verifyRes.interaction) {
      return new NextResponse('Invalid request', { status: 401 });
    }
    const { interaction } = verifyRes;

    if (interaction.type === InteractionType.Ping) {
      return NextResponse.json({ type: 1 });
    }
    if (interaction.type !== InteractionType.ApplicationCommand) {
      return ephemeralError('Unsupported interaction type.');
    }

    const allCommands = await getCommands();
    const commandName = interaction.data.name;
    const command = allCommands[commandName];
    if (!command) {
      return ephemeralError(`Unknown command: /${commandName}`);
    }

    const reply = await command.execute(interaction);
    return NextResponse.json(reply);
  } catch {
    return ephemeralError('Command failed. Please try again later.');
  }
}
