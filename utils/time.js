// Asia/Bangkok has a fixed UTC+07:00 offset and no daylight saving time,
// so every conversion below can use the explicit offset safely.
const OFFSET = '+07:00';
const OFFSET_MS = 7 * 3600000;
const SLOT_MINUTES = 60;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const toMinutes = hhmm => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHHMM = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const bangkokDate = (now = new Date()) => new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);
const startAtFor = (date, time) => new Date(`${date}T${time}:00${OFFSET}`);

// Fixed 60-minute periods from opening time; a final partial hour before closing is not offered.
function slotsFor(shop) {
  const open = toMinutes(shop.openTime);
  const close = toMinutes(shop.closeTime);
  const slots = [];
  for (let start = open; start + SLOT_MINUTES <= close; start += SLOT_MINUTES) {
    slots.push({ start: toHHMM(start), end: toHHMM(start + SLOT_MINUTES) });
  }
  return slots;
}

module.exports = { OFFSET, SLOT_MINUTES, HHMM, toMinutes, toHHMM, bangkokDate, startAtFor, slotsFor };
