import { serveLegacyHandler } from "../_shared/edgeAdapter.js";
import handler from "../_shared/legacy-handlers/create-user.js";

serveLegacyHandler(handler);
