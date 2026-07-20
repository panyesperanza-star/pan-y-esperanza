import { serveLegacyHandler } from "../_shared/edgeAdapter.js";
import handler from "../_shared/legacy-handlers/create-checkout-session.js";

serveLegacyHandler(handler);
