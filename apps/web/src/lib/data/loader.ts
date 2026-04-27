import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import fg from 'fast-glob';
import type { z } from 'zod';

const DATA_ROOT = path.resolve(process.cwd(), '../../data');

const cache = new Map<string, unknown>();

export async function loadAll<T>(glob: string, schema: z.ZodSchema<T>): Promise<T[]> {
  const cacheKey = glob;
  if (cache.has(cacheKey)) return cache.get(cacheKey) as T[];
  const files = await fg(glob, { cwd: DATA_ROOT, absolute: true });
  const out: T[] = [];
  for (const file of files) {
    const text = await fs.readFile(file, 'utf-8');
    out.push(schema.parse(parse(text)));
  }
  cache.set(cacheKey, out);
  return out;
}
