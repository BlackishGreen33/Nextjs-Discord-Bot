'use client';

import axios from 'axios';
import { NextPage } from 'next';
import Link from 'next/link';
import * as React from 'react';

import { CLIENT_APPLICATION_ID } from '@/common/configs';

const HomePage: NextPage = () => {
  const [registerCommandsKey, setRegisterCommandsKey] =
    React.useState<string>('');
  const [status, setStatus] = React.useState<string>('');

  const handleRegisterCommand = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const requestLink =
      '/api/discord-bot/register-commands?REGISTER_COMMANDS_KEY=' +
      registerCommandsKey;

    try {
      setStatus('Loading...');
      if (registerCommandsKey.length > 0) {
        await axios.post(requestLink);
      }
      setStatus('Commands registered!');
    } catch (error) {
      console.log((error as Error).message);
      setStatus('Something went wrong. Check the console for errors');
    }
  };

  return (
    <main className="flex h-dvh flex-col items-center p-24">
      <section className="flex flex-col items-center rounded-xl bg-gray-900 px-8 py-16 shadow-2xl">
        <h1 className="flex items-center gap-2 bg-none px-2 py-4 text-3xl font-bold">
          Nextjs Discord Bot
        </h1>
        <p>{status}</p>
        <form
          className="flex w-4/5 flex-col gap-3 p-2"
          onSubmit={handleRegisterCommand}
        >
          <input
            className="rounded-lg border-0 bg-gray-800 p-4 text-white outline-0"
            type="text"
            placeholder="Register Commands Key"
            value={registerCommandsKey}
            onChange={(e) => setRegisterCommandsKey(e.target.value)}
          />
          <button
            className="mb-5 cursor-pointer rounded-lg border-0 bg-indigo-500 bg-none p-4 font-bold text-white outline-0 hover:bg-indigo-600"
            disabled={registerCommandsKey.length < 1}
            type="submit"
          >
            Register Commands
          </button>
        </form>
        <Link
          id="invite-discord-bot-link"
          className='p-6 font-bold bg-none cursor-pointer text-white w-3/5 rounded-lg'
          href={`https://discord.com/api/oauth2/authorize?client_id=${CLIENT_APPLICATION_ID}&permissions=2147483648&scope=bot`}
          target="_blank"
          rel="noreferrer noopener"
        >
          Invite Discord Bot
        </Link>
        <div className="my-4 h-0.5 w-7/10 bg-gray-700" />
        <Link
          href="https://github.com/BlackishGreen33/Discord-Bot"
          target="_blank"
          rel="noreferrer noopener"
          className='flex gap-2 items-center p-2 font-bold bg-none cursor-pointer text-white bg-gray-800 rounded-lg hover:bg-gray-700'
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            x="0px"
            y="0px"
            width="30"
            height="30"
            viewBox="0 0 64 64"
          >
            <path
              fill="#fff"
              d="M32 6C17.641 6 6 17.641 6 32c0 12.277 8.512 22.56 19.955 25.286-.592-.141-1.179-.299-1.755-.479V50.85c0 0-.975.325-2.275.325-3.637 0-5.148-3.245-5.525-4.875-.229-.993-.827-1.934-1.469-2.509-.767-.684-1.126-.686-1.131-.92-.01-.491.658-.471.975-.471 1.625 0 2.857 1.729 3.429 2.623 1.417 2.207 2.938 2.577 3.721 2.577.975 0 1.817-.146 2.397-.426.268-1.888 1.108-3.57 2.478-4.774-6.097-1.219-10.4-4.716-10.4-10.4 0-2.928 1.175-5.619 3.133-7.792C19.333 23.641 19 22.494 19 20.625c0-1.235.086-2.751.65-4.225 0 0 3.708.026 7.205 3.338C28.469 19.268 30.196 19 32 19s3.531.268 5.145.738c3.497-3.312 7.205-3.338 7.205-3.338.567 1.474.65 2.99.65 4.225 0 2.015-.268 3.19-.432 3.697C46.466 26.475 47.6 29.124 47.6 32c0 5.684-4.303 9.181-10.4 10.4 1.628 1.43 2.6 3.513 2.6 5.85v8.557c-.576.181-1.162.338-1.755.479C49.488 54.56 58 44.277 58 32 58 17.641 46.359 6 32 6zM33.813 57.93C33.214 57.972 32.61 58 32 58 32.61 58 33.213 57.971 33.813 57.93zM37.786 57.346c-1.164.265-2.357.451-3.575.554C35.429 57.797 36.622 57.61 37.786 57.346zM32 58c-.61 0-1.214-.028-1.813-.07C30.787 57.971 31.39 58 32 58zM29.788 57.9c-1.217-.103-2.411-.289-3.574-.554C27.378 57.61 28.571 57.797 29.788 57.9z"
            ></path>
          </svg>
          Github Repository | BlackishGreen33
        </Link>
      </section>
    </main>
  );
};

export default HomePage;
