const mongoose = require('mongoose');
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'A JSON object is required');
  return Object.fromEntries(allowed.filter(key => Object.hasOwn(body, key)).map(key => [key, body[key]]));
}
function id(value) {
  if (typeof value !== 'string' || !mongoose.isObjectIdOrHexString(value)) fail(400, 'Invalid ID');
  return value;
}
function reservationDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    fail(400, 'Reservation date must be a valid YYYY-MM-DD date');
  }
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  if (value < today) fail(400, 'Choose today or a future date (Thailand time)');
  return value;
}
// AR1: start of a 60-minute period, HH:mm.
function startTime(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail(400, 'startTime is required, in HH:mm (for example 10:00)');
  return value;
}
// AR2: optional notes; trimmed and limited to NOTES_MAX characters.
const NOTES_MAX = 1000;
function notes(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') fail(400, 'Notes must be text');
  const trimmed = value.trim();
  if (trimmed.length > NOTES_MAX) fail(400, `Notes must be ${NOTES_MAX} characters or fewer`);
  return trimmed;
}
module.exports = { fail, fields, id, reservationDate, startTime, notes, NOTES_MAX };
