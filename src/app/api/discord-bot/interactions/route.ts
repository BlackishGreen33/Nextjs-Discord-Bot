import { APIInteractionResponse, InteractionType } from 'discord-api-types/v10';
import { NextResponse } from 'next/server';

import { PUBLIC_KEY } from '@/common/configs';
import { getCommands, verifyInteractionRequest } from '@/common/utils';

export async function POST(req: Request) {
  const startedAt = Date.now();
  const log = (phase: string, extra?: Record<string, unknown>) => {
    process.stdout.write(
      `[interactions] ${phase} ${JSON.stringify({
        t: Date.now() - startedAt,
        ...extra,
      })}\n`
    );
  };

  const ephemeralError = (content: string) =>
    NextResponse.json({
      type: 4,
      data: {
        content,
        flags: 64,
      },
    } satisfies APIInteractionResponse);

  try {
    log('start');
    const verifyRes = await verifyInteractionRequest(req, PUBLIC_KEY);

    if (!verifyRes.isValid || !verifyRes.interaction) {
      log('invalid-signature');
      return new NextResponse('Invalid request', { status: 401 });
    }
    const { interaction } = verifyRes;
    log('verified', { type: interaction.type });

    if (interaction.type === InteractionType.Ping) {
      log('discord-ping');
      return NextResponse.json({ type: 1 });
    }
    const allCommands = await getCommands();
    const commandName = interaction.data.name;
    const command = allCommands[commandName];
    if (!command) {
      log('unknown-command', { commandName, known: Object.keys(allCommands) });
      return ephemeralError(`Unknown command: /${commandName}`);
    }

    log('execute-command', { commandName });
    const reply = await command.execute(interaction);
    log('ok', { commandName });
    return NextResponse.json(reply);
  } catch (error) {
    const maybeError = error as { message?: string };
    log('execute-error', { message: maybeError.message ?? 'Unknown error' });
    return ephemeralError('Command failed. Please try again later.');
  }
}
