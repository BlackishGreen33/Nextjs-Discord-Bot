import {
  APIApplicationCommandInteraction,
  APIPingInteraction,
} from 'discord-api-types/v10';
import nacl from 'tweetnacl';

type VerifyWithNaclArgs = {
  appPublicKey: string;
  rawBody: string;
  signature: string;
  timestamp: string;
};

const verifyWithNacl = ({
  appPublicKey,
  signature,
  rawBody,
  timestamp,
}: VerifyWithNaclArgs): boolean => {
  const signatureBuffer = Buffer.from(signature, 'hex');
  const publicKeyBuffer = Buffer.from(appPublicKey, 'hex');
  const messageBuffer = Buffer.from(timestamp + rawBody);

  return nacl.sign.detached.verify(
    messageBuffer,
    signatureBuffer,
    publicKeyBuffer
  );
};

type Interaction = APIPingInteraction | APIApplicationCommandInteraction;

type VerifyDiscordRequestResult =
  | { isValid: false }
  | {
      isValid: true;
      interaction: Interaction;
    };

const verifyInteractionRequest = async (
  request: Request,
  appPublicKey: string
): Promise<VerifyDiscordRequestResult> => {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');

  if (!signature || !timestamp) {
    return { isValid: false };
  }

  const rawBody = await request.text();
  const isValidRequest = verifyWithNacl({
    appPublicKey,
    rawBody,
    signature,
    timestamp,
  });

  if (!isValidRequest) {
    return { isValid: false };
  }

  let interaction: Interaction;
  try {
    interaction = JSON.parse(rawBody) as Interaction;
  } catch {
    return { isValid: false };
  }

  return {
    interaction,
    isValid: true,
  };
};

export default verifyInteractionRequest;
