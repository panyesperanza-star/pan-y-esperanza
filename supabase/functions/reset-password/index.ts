import { serveLegacyHandler } from "../_shared/edgeAdapter.js";
import handler from "../_shared/legacy-handlers/reset-password.js";

serveLegacyHandler(handler);
