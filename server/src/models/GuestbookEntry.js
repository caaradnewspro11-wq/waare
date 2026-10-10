import mongoose from 'mongoose';
export default mongoose.model('GuestbookEntry', new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  message: { type: String, trim: true, maxlength: 200, default: '' },
  edited: { type: Boolean, default: false },
  editTokenHash: { type: String, select: false }, // SHA-256 of the secret kept in the author's browser; lets them edit/delete their own entry
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } }));
