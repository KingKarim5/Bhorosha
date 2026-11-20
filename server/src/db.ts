import dns from 'dns';
import mongoose from 'mongoose';
import { config } from './config';

export async function connectDb() {
  // Some home and office routers refuse the DNS SRV lookup a mongodb+srv:// address needs
  // ("querySrv ECONNREFUSED"). DNS_SERVERS=8.8.8.8,1.1.1.1 makes Node use those resolvers instead.
  if (process.env.DNS_SERVERS) dns.setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean));
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

export function dbState() {
  return ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
}
