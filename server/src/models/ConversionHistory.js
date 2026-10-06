import mongoose from 'mongoose';
export default mongoose.model('ConversionHistory', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  originalName: { type: String, maxlength: 200 },
  originalFormat: String, targetFormat: String,
  status: { type: String, enum: ['completed', 'failed'] },
  outputId: String,
  expiresAt: Date,
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } }));
