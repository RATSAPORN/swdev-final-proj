// AR4: queue number = the shop's booking order for that day (1, 2, 3, ...).
// `$inc` on a single counter document is atomic, so simultaneous bookings never share a number.
// Numbers are not reused after a deletion, so a number always identifies one booking.
const Counter = require('../models/Counter');
async function nextQueueNumber(shopId, apptDate) {
  const key = `queue:${shopId}:${apptDate}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const counter = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { upsert: true, new: true });
      return counter.seq;
    } catch (error) {
      if (error.code !== 11000) throw error; // two first-of-day upserts raced; retry the increment
    }
  }
  throw new Error('Could not allocate a queue number');
}
module.exports = { nextQueueNumber };
