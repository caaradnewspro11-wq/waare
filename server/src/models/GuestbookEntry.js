import mongoose from 'mongoose';
export default mongoose.model('GuestbookEntry', new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  message: { type: String, trim: true, maxlength: 200, default: '' },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } }));
