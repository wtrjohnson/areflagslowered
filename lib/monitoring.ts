type MonitoringMessage = { subject: string; text: string };

const recipient = process.env.MONITORING_EMAIL || "w@williamj.us";

export async function sendMonitoringEmail(message: MonitoringMessage) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false, reason: "Resend is not configured" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [recipient], subject: message.subject, text: message.text }),
    });
    return { sent: response.ok, reason: response.ok ? undefined : `Resend HTTP ${response.status}` };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "Resend request failed" };
  }
}

export async function notifyInboundIssue(subject: string, details: string) {
  return sendMonitoringEmail({ subject: `Are Flags Lowered: ${subject}`, text: `${details}\n\nReview the protected inbound queue for details.` });
}
