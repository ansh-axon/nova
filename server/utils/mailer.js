const nodemailer = require('nodemailer');

// ─────────────────────────────────────────────────────────────────────────────
// NOVA email delivery (free).
//
// PREFERRED (works on Render free tier): Brevo HTTP API over port 443.
//   Render's free tier BLOCKS outbound SMTP ports (25/465/587), so plain Gmail
//   SMTP cannot work there. Brevo sends over HTTPS, which is not blocked, and
//   the free plan allows 300 emails/day to any recipient (just verify a sender).
//   Configure in the environment:
//     BREVO_API_KEY=xkeysib-....           (from Brevo dashboard → SMTP & API → API Keys)
//     EMAIL_FROM=NOVA <your-verified@gmail.com>   (sender must be verified in Brevo)
//
// FALLBACK: Gmail SMTP (works locally or on hosts that allow SMTP).
//     EMAIL_USER=youraddress@gmail.com
//     EMAIL_PASS=your-16-char-app-password
//
// If neither is configured, the code is logged to the server console so the
// OTP flow is still testable.
// ─────────────────────────────────────────────────────────────────────────────

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) return null;

  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass: (pass || '').replace(/\s+/g, '') },
    connectionTimeout: 10000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  });
  return transporter;
}

// Parses "NOVA <addr@x.com>" → { name, email }. Falls back to a bare address.
function parseSender() {
  const raw = process.env.EMAIL_FROM || process.env.BREVO_SENDER || process.env.EMAIL_USER || '';
  const m = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (m) return { name: m[1] || 'NOVA', email: m[2].trim() };
  return { name: 'NOVA', email: raw.trim() };
}

function buildHtml(heading, intro, code) {
  return `
    <div style="font-family:Arial,sans-serif;background:#090d16;padding:32px;border-radius:12px;color:#e2e8f0;max-width:420px;margin:auto">
      <h1 style="color:#0df;letter-spacing:4px;margin:0 0 8px">NOVA</h1>
      <h2 style="color:#f8fafc;font-size:18px;margin:16px 0 8px">${heading}</h2>
      <p style="color:#94a3b8;font-size:14px;line-height:20px">${intro}</p>
      <div style="background:#0f172a;border:1px solid rgba(0,221,255,0.3);border-radius:10px;padding:18px;text-align:center;margin:20px 0">
        <span style="font-size:34px;font-weight:800;letter-spacing:10px;color:#0df">${code}</span>
      </div>
      <p style="color:#475569;font-size:12px">If you did not request this, you can safely ignore this email.</p>
    </div>`;
}

// Sends an email through the Brevo transactional HTTP API (port 443).
async function sendViaBrevo({ to, subject, html, text }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { ok: false, reason: 'NO_API_KEY' };
  const sender = parseSender();
  if (!sender.email) return { ok: false, reason: 'NO_SENDER (set EMAIL_FROM)' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'accept': 'application/json',
      },
      body: JSON.stringify({
        sender,
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: controller.signal,
    });
    const bodyText = await resp.text();
    if (resp.ok) return { ok: true, info: bodyText };
    return { ok: false, reason: `HTTP ${resp.status}: ${bodyText}` };
  } catch (err) {
    return { ok: false, reason: `${err.name}: ${err.message}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends a 6-digit code email. Tries Brevo HTTP API first, then Gmail SMTP, then
 * falls back to console logging. Always resolves (never throws).
 */
async function sendCodeEmail(to, code, purpose) {
  const isReset = purpose === 'reset';
  const subject = isReset ? 'NOVA Password Reset Code' : 'NOVA Verification Code';
  const heading = isReset ? 'Reset your password' : 'Verify your account';
  const intro = isReset
    ? 'Use the code below to reset your NOVA password. It expires in 10 minutes.'
    : 'Welcome to NOVA! Use the code below to verify your account. It expires in 10 minutes.';
  const html = buildHtml(heading, intro, code);
  const text = `${heading}. Your NOVA code is ${code}. It expires in 10 minutes.`;

  // 1) Brevo HTTP API (preferred — works on Render free tier)
  if (process.env.BREVO_API_KEY) {
    const r = await sendViaBrevo({ to, subject, html, text });
    if (r.ok) {
      console.log(`[MAILER] ${purpose} code sent via Brevo to ${to}`);
      return true;
    }
    console.error(`[MAILER] Brevo send failed (${r.reason}). Trying SMTP/console...`);
  }

  // 2) Gmail SMTP (works locally / on hosts that allow SMTP)
  const t = getTransporter();
  if (t) {
    try {
      await t.sendMail({ from: process.env.EMAIL_FROM || `NOVA <${process.env.EMAIL_USER}>`, to, subject, html, text });
      console.log(`[MAILER] ${purpose} code emailed via SMTP to ${to}`);
      return true;
    } catch (err) {
      console.error('[MAILER] SMTP send failed:', err.message);
    }
  }

  // 3) Console fallback
  console.log('────────────────────────────────────────────');
  console.log(`[MAILER] (no email transport) ${purpose.toUpperCase()} code for ${to}: ${code}`);
  console.log('────────────────────────────────────────────');
  return true;
}

// Generates a 6-digit numeric code as a string
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Diagnostic helper: reports which transport is configured and (optionally)
// attempts a real send, returning the exact error for troubleshooting.
async function testMailer(to) {
  const result = {
    brevoApiKeySet: !!process.env.BREVO_API_KEY,
    emailFrom: process.env.EMAIL_FROM || null,
    sender: parseSender(),
    smtpConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
    brevoSend: null,
    smtpVerify: null,
  };

  if (to && process.env.BREVO_API_KEY) {
    const r = await sendViaBrevo({
      to,
      subject: 'NOVA Email Test',
      html: '<p>NOVA email test via Brevo. If you received this, email works.</p>',
      text: 'NOVA email test via Brevo.',
    });
    result.brevoSend = r.ok ? 'OK' : `FAIL: ${r.reason}`;
  }

  const t = getTransporter();
  if (t) {
    try { await t.verify(); result.smtpVerify = 'OK'; }
    catch (err) { result.smtpVerify = `FAIL: ${err.code || ''} ${err.message}`; }
  }

  return result;
}

module.exports = { sendCodeEmail, generateCode, testMailer };
