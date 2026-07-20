import { serveLegacyHandler } from "../_shared/edgeAdapter.js";
import handler from "../_shared/legacy-handlers/send-justificantes.js";

serveLegacyHandler(handler);
