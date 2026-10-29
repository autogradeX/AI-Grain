export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code?: string) =>
  new HttpError(400, message, code);
export const unauthorized = (message = "Not signed in", code?: string) =>
  new HttpError(401, message, code);
export const forbidden = (message = "You don't have permission to do that") =>
  new HttpError(403, message);
export const notFound = (what = "Resource") =>
  new HttpError(404, `${what} not found`);
export const conflict = (message: string) => new HttpError(409, message);
