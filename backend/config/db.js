const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const connection = await mongoose.connect(process.env.MONGO_URI);
    console.log(
      `[DB] MongoDB connected successfully at ${connection.connection.host}/${connection.connection.name}`
    );
  } catch (error) {
    console.error(`[DB] MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
