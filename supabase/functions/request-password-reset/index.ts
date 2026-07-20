import { serveLegacyHandler } from "../_shared/edgeAdapter.js";
import handler from "../_shared/legacy-handlers/request-password-reset.js";

serveLegacyHandler(handler);
