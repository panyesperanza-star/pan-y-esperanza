import { serveLegacyHandler } from "../_shared/edgeAdapter.js";
import handler from "../_shared/legacy-handlers/admin-user.js";

serveLegacyHandler(handler);
