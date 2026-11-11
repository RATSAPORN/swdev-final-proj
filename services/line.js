// AR6/AR4/AR5: the only module that talks to LINE.
// - LINE Login v2.1 (OpenID Connect) with state, nonce and PKCE; the server exchanges the code.
// - Messaging API push messages.
// Modes:
//   login: 'live' (channel ID/secret/callback set), 'mock' (LINE_MOCK_LOGIN=true, never in production), or 'off'.
//   messaging: 'live' (channel access token set) or 'dry-run' (messages are kept in `sent` and logged, not sent).
// Secrets and tokens are never logged or returned.
const crypto = require('crypto');

const AUTHORIZE_URL = 'https://access.line.me/oauth2/v2.1/authorize';
const TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token';
const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';
const PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const MOCK_CODE = 'mock-code';

const env = key => (process.env[key] || '').trim();
const sent = []; // dry-run outbox, newest last
const mask = id => (typeof id === 'string' && id.length > 9 ? `${id.slice(0, 5)}…${id.slice(-4)}` : '…');
const quiet = () => env('LINE_LOG_QUIET') === 'true';

function loginMode() {
  if (env('LINE_MOCK_LOGIN') === 'true' && env('NODE_ENV') !== 'production') return 'mock';
  if (env('LINE_LOGIN_CHANNEL_ID') && env('LINE_LOGIN_CHANNEL_SECRET') && env('LINE_LOGIN_CALLBACK_URL')) return 'live';
  return 'off';
}
const messagingMode = () => (env('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN') ? 'live' : 'dry-run');

const random = () => crypto.randomBytes(32).toString('base64url');
function newLoginRequest() {
  return { state: random(), nonce: random(), codeVerifier: random() };
}
function authorizeUrl({ state, nonce, codeVerifier }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env('LINE_LOGIN_CHANNEL_ID'),
    redirect_uri: env('LINE_LOGIN_CALLBACK_URL'),
    state,
    scope: 'profile openid',
    nonce,
    // Ask the user to add the linked LINE Official Account as a friend; push messages only reach friends.
    bot_prompt: env('LINE_BOT_PROMPT') || 'aggressive',
    code_challenge: crypto.createHash('sha256').update(codeVerifier).digest('base64url'),
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE_URL}?${params}`;
}
function mockCallbackPath(state) {
  return `/api/v1/line/callback?${new URLSearchParams({ code: MOCK_CODE, state })}`;
}

async function postForm(url, form) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`${new URL(url).pathname} returned HTTP ${response.status}`);
  return response.json();
}

// Returns { sub } (the LINE userId). Access/refresh tokens are discarded immediately.
async function verifyLogin({ code, codeVerifier, nonce, userId }) {
  if (loginMode() === 'mock') {
    if (code !== MOCK_CODE) throw new Error('Mock LINE Login received an unknown code');
    return { sub: `U${crypto.createHash('sha256').update(`mock:${userId}`).digest('hex').slice(0, 32)}` };
  }
  const token = await postForm(TOKEN_URL, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: env('LINE_LOGIN_CALLBACK_URL'),
    client_id: env('LINE_LOGIN_CHANNEL_ID'),
    client_secret: env('LINE_LOGIN_CHANNEL_SECRET'),
    code_verifier: codeVerifier,
  });
  if (!token.id_token) throw new Error('LINE token response had no ID token (is the openid scope enabled?)');
  // LINE's verify endpoint checks signature, issuer, audience (client_id), expiry and nonce.
  const claims = await postForm(VERIFY_URL, { id_token: token.id_token, client_id: env('LINE_LOGIN_CHANNEL_ID'), nonce });
  if (typeof claims.sub !== 'string' || !claims.sub) throw new Error('LINE ID token had no subject');
  return { sub: claims.sub };
}

async function pushMessage(to, text) {
  const message = String(text).slice(0, 5000);
  if (messagingMode() === 'dry-run') {
    sent.push({ to, text: message, at: new Date().toISOString() });
    if (sent.length > 100) sent.shift();
    if (!quiet()) console.log(`[LINE dry-run] push to ${mask(to)}:\n${message}`);
    return { dryRun: true };
  }
  const response = await fetch(PUSH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')}`,
      'Content-Type': 'application/json',
      'X-Line-Retry-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({ to, messages: [{ type: 'text', text: message }] }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`push to ${mask(to)} returned HTTP ${response.status}${typeof body.message === 'string' ? ` (${body.message})` : ''}`);
  }
  return { dryRun: false };
}

function logError(label, error) {
  if (!quiet()) console.error(`[LINE] ${label} failed: ${error && error.message ? error.message : 'unknown error'}`);
}

module.exports = { loginMode, messagingMode, newLoginRequest, authorizeUrl, mockCallbackPath, verifyLogin, pushMessage, logError, sent, mask };
