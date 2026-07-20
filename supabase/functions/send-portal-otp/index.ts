import { serveLegacyHandler } from "../_shared/edgeAdapter.js";
import handler from "../_shared/legacy-handlers/send-portal-otp.js";

serveLegacyHandler(handler);
