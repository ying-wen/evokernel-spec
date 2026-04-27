import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import fg from 'fast-glob';
import type { z } from 'zod';

const DATA_ROOT = path.resolve(process.cwd(), '../../data');

export function yamlGlobLoader<T extends z.ZodSchema>(opts: {
  glob: string;
  schema: T;
}) {
  return {
    name: `yaml-glob:${opts.glob}`,
    load: async (ctx: { store: Map<string, { id: string; data: z.infer<T> }>; logger?: { info: (m: string) => void } }) => {
      const files = await fg(opts.glob, { cwd: DATA_ROOT, absolute: true });
      ctx.store.clear();
      for (const file of files) {
        const text = await fs.readFile(file, 'utf-8');
        const parsed = opts.schema.parse(parse(text)) as { id: string };
        ctx.store.set(parsed.id, { id: parsed.id, data: parsed as z.infer<T> });
      }
      ctx.logger?.info(`loaded ${files.length} from ${opts.glob}`);
    }
  };
}
