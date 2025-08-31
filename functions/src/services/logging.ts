// Logging service: compliance, consent, audit trails
export async function logEvent(userId: string, event: string, payload?: any) {
  // TODO: centralize logging sinks (Firestore + optional BigQuery)
}
