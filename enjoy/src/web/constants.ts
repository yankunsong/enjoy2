/**
 * The local user Local Web Enjoy seeds at startup.
 *
 * Eight digits is not cosmetic: the session scan in `@main/settings` filters
 * Library subdirectories by that exact shape, so any other id makes the local
 * user invisible. The value is also baked into Library directory names and into
 * the deterministic UUID of every Recording — changing it orphans existing
 * data. See enjoy/docs/adr/0003-fake-local-user-instead-of-removing-accounts.md.
 */
export const LOCAL_USER_ID = 10000001;

export const LOCAL_USER_NAME = "Local";
