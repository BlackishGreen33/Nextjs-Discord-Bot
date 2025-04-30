import { NextApiRequest } from 'next';

export const rawBodyToString = async (req: NextApiRequest): Promise<string> => {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    req.on('error', (error) => {
      reject(error);
    });
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString());
    });
  });
};

export const rawBodyToStringTwo = async (
  req: NextApiRequest
): Promise<string> => {
  return new Promise<string>((resolve) => {
    if (!req.body) {
      let buffer = '';
      req.on('data', (chunk) => {
        buffer += chunk;
      });
      req.on('end', () => {
        resolve(buffer.toString());
      });
    }
  });
};
