export async function recordAuditEvent(storage, event) {
  try {
    await storage.createAuditEvent(event);
  } catch (err) {
    console.warn(`[Audit] Could not record ${event.action}: ${String(err?.message || err).slice(0, 240)}`);
  }
}
