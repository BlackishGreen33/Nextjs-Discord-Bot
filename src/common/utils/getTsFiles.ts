import { readdirSync } from 'fs';

const getTsFiles = (dir: string) => {
  const files = readdirSync(dir).filter((file) => file.endsWith('.ts'));
  return files;
};

export default getTsFiles;
