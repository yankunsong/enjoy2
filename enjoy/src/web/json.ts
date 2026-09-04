import http from "http";

/**
 * The one envelope the local server answers in: `{ result }` on success and
 * `{ error }` on failure, so a handler returning `undefined` still reads as a
 * success and a failure always carries a sentence saying what went wrong.
 */
export const send = (
  response: http.ServerResponse,
  status: number,
  body: unknown
) => {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
};
