import { serveLegacyHandler } from "../_shared/edgeAdapter.js";
import handler from "../_shared/legacy-handlers/social-resource-watchdog.js";

serveLegacyHandler(handler);
