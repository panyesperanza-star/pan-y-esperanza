import { serveLegacyHandler } from "../_shared/edgeAdapter.js";
import handler from "../_shared/legacy-handlers/emergency-create-user.js";

serveLegacyHandler(handler);
