"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logEvent = void 0;
// Logging service: compliance, consent, audit trails
async function logEvent(userId, event, payload) {
    // TODO: centralize logging sinks (Firestore + optional BigQuery)
}
exports.logEvent = logEvent;
//# sourceMappingURL=logging.js.map