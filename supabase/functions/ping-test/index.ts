import { serveLegacyHandler } from "../_shared/edgeAdapter.js";
import handler from "../_shared/legacy-handlers/ping-test.js";

serveLegacyHandler(handler);
