import { NextResponse } from 'next/server';

import { REGISTER_COMMANDS_KEY } from '@/common/configs';
import { discord_api, getCommands } from '@/common/utils';

export async function POST(req: Request) {
  try {
    if (!req.url.endsWith(REGISTER_COMMANDS_KEY))
      throw new Error('Register commands key was invalid!');
    const allCommands = await getCommands();
    const arrayOfSlashCommandsRegister = Object.values(allCommands);
    const arrayOfSlashCommandsRegisterJSON = arrayOfSlashCommandsRegister.map(
      (command) => command.register.toJSON()
    );

    const registerCommands = await discord_api.put(
      `/applications/${process.env.NEXT_PUBLIC_APPLICATION_ID!}/commands`,
      arrayOfSlashCommandsRegisterJSON
    );

    console.log('== COMMANDS REGISTERED ===');
    console.log(registerCommands.data);
    console.log('== COMMANDS REGISTERED ===');

    return NextResponse.json({ error: null });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error Occured' }, { status: 500 });
  }
}
