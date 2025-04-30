import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    BOT_TOKEN: process.env.BOT_TOKEN,
    PUBLIC_KEY: process.env.PUBLIC_KEY,
    REGISTER_COMMANDS_KEY: process.env.REGISTER_COMMANDS_KEY,
  },
};

export default nextConfig;
