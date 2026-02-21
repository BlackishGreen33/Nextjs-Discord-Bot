import { APIInteractionResponse, InteractionType } from 'discord-api-types/v10';
import { NextResponse } from 'next/server';

import { PUBLIC_KEY } from '@/common/configs';
import { getCommands, verifyInteractionRequest } from '@/common/utils';

export async function POST(req: Request) {
  try {
    const verifyRes = await verifyInteractionRequest(req, PUBLIC_KEY);

    if (!verifyRes.isValid || !verifyRes.interaction) {
      return new NextResponse('Invalid request', { status: 401 });
    }
    const { interaction } = verifyRes;

    if (interaction.type === InteractionType.Ping) {
      return NextResponse.json({ type: 1 });
    }

    const allCommands = await getCommands();

    let reply: APIInteractionResponse | null = null;
    const commandName = interaction.data.name + '.ts';
    if (allCommands[commandName]) {
      reply = await allCommands[commandName].execute(interaction);
    }

    if (!reply) throw new Error();
    return NextResponse.json(reply);
  } catch {
    return NextResponse.error();
  }
}
