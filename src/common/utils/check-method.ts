import { NextApiRequest } from 'next';

type httpMethods = 'PUT' | 'POST' | 'GET' | 'DELETE';

const allowedMethod = (req: NextApiRequest, allowedMethod: httpMethods) =>
  req.method === allowedMethod;

export default allowedMethod;
