import { app } from './app.js';
import { connectDb } from './config/db.js';
const port = process.env.PORT || 4000;
await connectDb().catch((e) => console.error('MongoDB connection failed:', e.message));
app.listen(port, () => console.log(`API on :${port}`));
