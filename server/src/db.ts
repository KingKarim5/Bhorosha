import mongoose from 'mongoose';
import { config } from './config';

export async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

export function dbState() {
  return ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
}
