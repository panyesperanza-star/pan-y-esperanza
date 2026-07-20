import { serveLegacyHandler } from "../_shared/edgeAdapter.js";
import handler from "../_shared/legacy-handlers/emergency-admin-repair.js";

serveLegacyHandler(handler);
