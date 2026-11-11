const mongoose = require("mongoose");

const connectDB = async () => {
  mongoose.set("strictQuery", true); // only to suppress deprecated warning! No special meaning.
  const conn = await mongoose.connect(process.env.MONGO_URI, {
    ...(process.env.MONGO_DB ? { dbName: process.env.MONGO_DB } : {}),
  });

  console.log(`MongoDB Connected: ${conn.connection.host} / ${conn.connection.name}`);
};

module.exports = connectDB;
