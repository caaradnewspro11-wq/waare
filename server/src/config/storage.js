import path from 'node:path';
import os from 'node:os';
export const DIR = path.join(os.tmpdir(), 'ali-docs');
export const TTL_MS = 30 * 60 * 1000;
