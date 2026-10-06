import mongoose from 'mongoose';
export const dbReady = () => mongoose.connection.readyState === 1;
export async function connectDb() {
  if (!process.env.MONGO_URI) return console.warn('MONGO_URI not set: accounts & history disabled (guest conversions still work).');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected');
}
