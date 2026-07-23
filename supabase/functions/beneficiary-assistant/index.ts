import { serveLegacyHandler } from "../_shared/edgeAdapter.js";
import handler from "../_shared/legacy-handlers/beneficiary-assistant.js";

serveLegacyHandler(handler);
