type EmailMessage = { to: string; subject: string; text: string };

export async function sendEmail(message: EmailMessage) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.info(`[email preview] To: ${message.to} | Subject: ${message.subject}\n${message.text}`);
    return { mode: "preview" as const };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }) });
    if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
    return { mode: "sent" as const };
  } catch (error) {
    console.error("Unable to send email notification", error);
    return { mode: "failed" as const };
  }
}
