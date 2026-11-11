// AR4: atomic sequence counters (one document per shop and day for queue numbers).
const mongoose = require('mongoose');
const schema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }, { collection: 'counters', versionKey: false });
module.exports = mongoose.model('Counter', schema);
