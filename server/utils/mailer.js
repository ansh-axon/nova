const nodemailer = require('nodemailer');

// Free email delivery via SMTP (e.g. Gmail with an App Password).
// Configure in .env:
//   EMAIL_USER=youraddress@gmail.com
//   EMAIL_PASS=your-16-char-app-password
//   EMAIL_FROM=NOVA <youraddress@gmail.com>   (optional)
//
// If EMAIL_USER / EMAIL_PASS are not set, the code is logged to the server
// console instead of being emailed — so the OTP flow is fully testable without
// any email setup.

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) return null;

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return transporter;
}

/**
 * Sends a 6-digit code email. Falls back to console logging when SMTP is not
 * configured. Returns true if handled (emailed or logged).
 */
async function sendCodeEmail(to, code, purpose) {
  const isReset = purpose === 'reset';
  const subject = isReset ? 'NOVA Password Reset Code' : 'NOVA Verification Code';
  const heading = isReset ? 'Reset your password' : 'Verify your account';
  const intro = isReset
    ? 'Use the code below to reset your NOVA password. It expires in 10 minutes.'
    : 'Welcome to NOVA! Use the code below to verify your account. It expires in 10 minutes.';

  const t = getTransporter();

  if (!t) {
    console.log('────────────────────────────────────────────');
    console.log(`[MAILER] (SMTP not configured) ${purpose.toUpperCase()} code for ${to}: ${code}`);
    console.log('────────────────────────────────────────────');
    return true;
  }

  const html = `
    <div style="font-family:Arial,sans-serif;background:#090d16;padding:32px;border-radius:12px;color:#e2e8f0;max-width:420px;margin:auto">
      <h1 style="color:#0df;letter-spacing:4px;margin:0 0 8px">NOVA</h1>
      <h2 style="color:#f8fafc;font-size:18px;margin:16px 0 8px">${heading}</h2>
      <p style="color:#94a3b8;font-size:14px;line-height:20px">${intro}</p>
      <div style="background:#0f172a;border:1px solid rgba(0,221,255,0.3);border-radius:10px;padding:18px;text-align:center;margin:20px 0">
        <span style="font-size:34px;font-weight:800;letter-spacing:10px;color:#0df">${code}</span>
      </div>
      <p style="color:#475569;font-size:12px">If you did not request this, you can safely ignore this email.</p>
    </div>`;

  try {
    await t.sendMail({
      from: process.env.EMAIL_FROM || `NOVA <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text: `${heading}. Your NOVA code is ${code}. It expires in 10 minutes.`,
    });
    console.log(`[MAILER] ${purpose} code emailed to ${to}`);
    return true;
  } catch (err) {
    console.error('[MAILER] Failed to send email, falling back to console:', err.message);
    console.log(`[MAILER] ${purpose.toUpperCase()} code for ${to}: ${code}`);
    return true;
  }
}

// Generates a 6-digit numeric code as a string
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = { sendCodeEmail, generateCode };
