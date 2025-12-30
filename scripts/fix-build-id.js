// Garante que o arquivo .next/BUILD_ID exista após o build.
// Evita falhas quando o passo de pós-build é executado em ambientes sem cache.
import { existsSync, writeFileSync } from 'fs';
import path from 'path';

const buildIdPath = path.join(process.cwd(), '.next', 'BUILD_ID');

if (!existsSync(buildIdPath)) {
  const fallbackId =
    process.env.NEXT_BUILD_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    String(Date.now());
  writeFileSync(buildIdPath, fallbackId, 'utf8');
}
