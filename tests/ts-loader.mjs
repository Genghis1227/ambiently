import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context.parentURL
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const basePath = path.resolve(parentDir, specifier);
      for (const ext of ['.ts', '.tsx', '.js', '.mjs']) {
        const candidate = basePath + ext;
        if (existsSync(candidate)) {
          return nextResolve(pathToFileURL(candidate).href, context);
        }
      }
      for (const indexFile of ['index.ts', 'index.tsx', 'index.js']) {
        const candidate = path.join(basePath, indexFile);
        if (existsSync(candidate)) {
          return nextResolve(pathToFileURL(candidate).href, context);
        }
      }
    }
    throw err;
  }
}
