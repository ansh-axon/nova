// Centralised, validated configuration. Fails fast on missing critical secrets
// instead of silently falling back to a public/hardcoded value (which would let
// anyone forge auth tokens).
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 16) {
  // Do NOT start the server with a weak/absent signing secret.
  console.error(
    '\n[FATAL] JWT_SECRET is missing or too short.\n' +
    'Set a strong JWT_SECRET (32+ random chars) in the environment before starting.\n'
  );
  process.exit(1);
}

module.exports = { JWT_SECRET };
