/**
 * The browser end of the envelope `json.ts` defines.
 *
 * Every route on the local server answers in the same shape — `{ result }` on
 * success, `{ error }` on failure — so every request made from here reads its
 * answer the same way. The server names what failed in its message; keeping
 * that sentence intact is the difference between a diagnosable failure and a
 * mystery, so it is what the thrown error carries.
 */
export const unwrap = async (
  response: Response,
  describe: () => string,
): Promise<any> => {
  // A body that is not the envelope at all — a proxy's own error page, say —
  // still has to reach the caller as the failure it is, named by `describe`,
  // rather than as a parse error from somewhere further down.
  const body = await response.json().catch((): null => null);

  if (!response.ok) throw new Error(body?.error ?? describe());

  return body?.result;
};
