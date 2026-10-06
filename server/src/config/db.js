import mongoose from 'mongoose';
export const dbReady = () => mongoose.connection.readyState === 1;
export async function connectDb() {
  const uri = process.env.MONGO_URI;
  if (!uri) return console.warn('MONGO_URI not set: accounts & history disabled (guest conversions still work).');
  const attempt = async () => {
    try { await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 }); console.log('MongoDB connected'); }
    catch (e) { console.error('MongoDB connection failed:', e.message, '- retrying in 15s'); setTimeout(attempt, 15000); }
  };
  await attempt();
}
