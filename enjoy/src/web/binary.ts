import { walk } from "./traverse";

/**
 * The one thing a JSON argument list cannot carry: bytes.
 *
 * Under Electron an argument crosses to the main process by structured clone,
 * which carries an `ArrayBuffer` or a `Uint8Array` as itself. Here the same
 * argument list is a JSON body, where `JSON.stringify` renders the first as
 * `{}` and the second as an object of numbered keys — silently, both of them.
 * The handler then reads a recording of no length, or an audio source it cannot
 * recognise, and reports that instead. Two of those cross on the shadowing
 * path: the bytes of a recording, and the bytes Alignment reads to make a
 * Timeline.
 *
 * Base64 rather than a second request: the bytes belong to the argument list
 * they arrive with, and a separate upload would need the two matched up again
 * on the far side. It costs a third more bytes over a loopback socket.
 *
 * Both halves live here, and neither reaches for anything the other host lacks
 * — `atob` and `btoa` are the browser's and Node's alike — so the wire form is
 * stated once and cannot drift. See
 * enjoy/docs/adr/0008-binary-arguments-travel-inside-the-argument-list.md.
 */

const BINARY_KEY = "__binary__";

/**
 * Which of the two kinds the bytes arrived as. Absent means an `ArrayBuffer`;
 * the handlers tell them apart — Echogarden's audio source accepts a
 * `Uint8Array` and has never heard of an `ArrayBuffer` — so the wire form has
 * to as well.
 */
const VIEW_KEY = "__view__";

type Encoded = { [BINARY_KEY]: string; [VIEW_KEY]?: true };

/** What the renderer passes to a handler, on its way to the local server. */
export const encodeBinary = <T>(value: T): T => {
  if (value instanceof ArrayBuffer) {
    return wrap(new Uint8Array(value), false) as T;
  }

  if (value instanceof Uint8Array) {
    const { buffer, byteOffset, byteLength } = value;
    return wrap(new Uint8Array(buffer, byteOffset, byteLength), true) as T;
  }

  // Every other view is a silent mangling waiting to happen, and no call site
  // has one. Naming it is what the bridge does everywhere else it runs out of
  // road; see ADR 0004.
  if (ArrayBuffer.isView(value)) {
    throw new Error(
      `Local Web Enjoy cannot carry a ${value.constructor.name} across the bridge`
    );
  }

  return walk(value, encodeBinary);
};

/** What arrives at the local server, on its way to the handler. */
export const decodeBinary = <T>(value: T): T => {
  const encoded = asEncoded(value);
  if (encoded !== null) return unwrap(encoded) as T;

  return walk(value, decodeBinary);
};

// One argument at a time, so a recording is one string rather than a rope of
// them; the chunking is only because `btoa`'s argument is a call's worth of
// characters and a long one overflows the stack.
const CHUNK_SIZE = 0x8000;

const wrap = (bytes: Uint8Array, view: boolean): Encoded => {
  let characters = "";
  for (let at = 0; at < bytes.length; at += CHUNK_SIZE) {
    characters += String.fromCharCode(...bytes.subarray(at, at + CHUNK_SIZE));
  }

  const encoded: Encoded = { [BINARY_KEY]: btoa(characters) };
  return view ? { ...encoded, [VIEW_KEY]: true } : encoded;
};

const unwrap = (encoded: Encoded) => {
  const characters = atob(encoded[BINARY_KEY]);
  const bytes = new Uint8Array(characters.length);
  for (let at = 0; at < characters.length; at++) {
    bytes[at] = characters.charCodeAt(at);
  }

  return encoded[VIEW_KEY] ? bytes : bytes.buffer;
};

/**
 * An encoded run of bytes is a plain object with those keys and nothing else,
 * so an ordinary argument that happens to carry a field of the same name is not
 * mistaken for one.
 */
const asEncoded = (value: unknown): Encoded | null => {
  if (value?.constructor !== Object) return null;

  const entries = Object.entries(value as object);
  const bytes = entries.find(([key]) => key === BINARY_KEY);

  if (!bytes || typeof bytes[1] !== "string") return null;
  if (entries.length > (VIEW_KEY in (value as object) ? 2 : 1)) return null;

  return value as Encoded;
};
