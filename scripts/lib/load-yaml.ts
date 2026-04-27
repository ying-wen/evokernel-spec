import fs from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';

export async function loadYaml<T>(path: string): Promise<T> {
  const text = await fs.readFile(path, 'utf-8');
  return parseYaml(text) as T;
}
