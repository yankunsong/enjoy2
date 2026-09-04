import db from "@main/db";
import {
  bootstrap,
  seedCredentialsFromEnv,
  seedLocalProfile,
} from "./bootstrap";
import { createServer, DEFAULT_PORT } from "./server";
import { clearStaging } from "./staging";

/**
 * Entry point of the local server. Loaded by `start.mjs`, which is what
 * supplies the module resolution that swaps Electron out.
 */
export const start = async () => {
  bootstrap();

  // The first connection of a fresh environment happens here, with a local
  // user seeded and no profile record yet — the one order that has to hold.
  await db.connect();
  await seedLocalProfile();
  await seedCredentialsFromEnv();
  await clearStaging();

  const server = createServer();
  const port = Number(process.env.ENJOY_WEB_PORT ?? DEFAULT_PORT);
  // Loopback only: no LAN access, so no self-signed certificate and no
  // microphone-permission problem in the browser.
  const url = await server.listen(port);

  console.log(`Local Web Enjoy listening on ${url}`);

  return { server, url };
};
