import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import { DIR } from '../config/storage.js';

// getRule(req) -> { exts, mimes } for the current route, or undefined to reject.
export function makeUpload(maxMb, getRule) {
  return multer({
    storage: multer.diskStorage({
      destination: DIR,
      filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()), // never trust the user's filename
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
      const rule = getRule(req);
      const ok = rule && rule.exts.includes(path.extname(file.originalname).toLowerCase()) && rule.mimes.includes(file.mimetype);
      cb(ok ? null : Object.assign(new Error('Unsupported file type for this tool.'), { status: 415 }), ok);
    },
  });
}

export const IMAGE_RULE = {
  exts: ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.bmp', '.webp'],
  mimes: ['image/jpeg', 'image/png', 'image/tiff', 'image/bmp', 'image/webp'],
};
export const SCAN_RULE = { exts: ['.pdf', ...IMAGE_RULE.exts], mimes: ['application/pdf', ...IMAGE_RULE.mimes] };
