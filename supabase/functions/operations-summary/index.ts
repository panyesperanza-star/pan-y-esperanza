import { serveLegacyHandler } from "../_shared/edgeAdapter.js";
import handler from "../_shared/legacy-handlers/operations-summary.js";

serveLegacyHandler(handler);
