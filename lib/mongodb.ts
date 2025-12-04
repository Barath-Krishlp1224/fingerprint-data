// lib/mongodb.ts
import mongoose from "mongoose";

// Don't throw here — just read the value
const MONGODB_URI = process.env.MONGODB_URI || "";

let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

async function connectDB() {
  // Throw ONLY when we actually attempt connection
  if (!MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is not set. Please add it to .env.local or your deployment environment settings."
    );
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        bufferCommands: false,
      })
      .then((mongooseInstance) => {
        console.log("Connected to MongoDB");
        return mongooseInstance;
      })
      .catch((err) => {
        console.error("MongoDB connection error:", err);
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectDB;
