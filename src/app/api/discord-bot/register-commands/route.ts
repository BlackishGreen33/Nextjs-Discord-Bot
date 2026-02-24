import { NextResponse } from 'next/server';

import { REGISTER_COMMANDS_KEY } from '@/common/configs';
import { discord_api, getCommands } from '@/common/utils';

export async function POST(req: Request) {
  const authorization = req.headers.get('authorization');
  const bearerPrefix = 'Bearer ';
  const requestKey =
    authorization && authorization.startsWith(bearerPrefix)
      ? authorization.slice(bearerPrefix.length)
      : null;

  if (!requestKey || requestKey !== REGISTER_COMMANDS_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const allCommands = await getCommands();
    const arrayOfSlashCommandsRegister = Object.values(allCommands);
    const arrayOfSlashCommandsRegisterJSON = arrayOfSlashCommandsRegister.map(
      (command) => command.register.toJSON()
    );

    await discord_api.put(
      `/applications/${process.env.NEXT_PUBLIC_APPLICATION_ID!}/commands`,
      arrayOfSlashCommandsRegisterJSON
    );

    return NextResponse.json({ error: null });
  } catch {
    return NextResponse.json({ error: 'Error occurred' }, { status: 500 });
  }
}
