import "../../index.css";
import { installBridge } from "./bridge";
import { subscribeToPushes } from "./events";

/**
 * Browser entry point. The renderer reads `window.__ENJOY_APP__` while its
 * modules are still evaluating, so the bridge has to be in place before the
 * first line of it runs — hence the dynamic import rather than a static one.
 */
installBridge();
// Before the renderer, so that a push made while it is still mounting is
// delivered to whatever has registered by the time it arrives.
subscribeToPushes();

import("../../renderer/index");
