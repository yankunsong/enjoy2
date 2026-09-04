import "../../index.css";
import { installBridge } from "./bridge";

/**
 * Browser entry point. The renderer reads `window.__ENJOY_APP__` while its
 * modules are still evaluating, so the bridge has to be in place before the
 * first line of it runs — hence the dynamic import rather than a static one.
 */
installBridge();

import("../../renderer/index");
