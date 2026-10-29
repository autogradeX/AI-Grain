import type { FastifyRequest } from "fastify";
import { badRequest } from "../../lib/errors.js";

/** Reads a multipart request with one file and any number of text fields. */
export async function readUpload(
  request: FastifyRequest,
): Promise<{ file: Buffer; filename: string; fields: Record<string, string> }> {
  if (!request.isMultipart())
    throw badRequest("Send the photo as multipart/form-data");
  const fields: Record<string, string> = {};
  let file: Buffer | undefined;
  let filename = "";
  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (file) throw badRequest("Send one file per request");
      file = await part.toBuffer();
      filename = part.filename;
    } else if (typeof part.value === "string") {
      fields[part.fieldname] = part.value;
    }
  }
  if (!file?.length) throw badRequest("No file received");
  return { file, filename, fields };
}
