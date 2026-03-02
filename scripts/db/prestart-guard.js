import { spawnSync } from 'node:child_process';

function run(cmd, args, label) {
  const pretty = [cmd, ...args].join(' ');
  console.log(`\n[prestart-guard] ${label}: ${pretty}`);
  return spawnSync(cmd, args, { stdio: 'inherit', env: process.env });
}

function fail(message) {
  console.error(`\n[prestart-guard] ERROR: ${message}`);
  process.exit(1);
}

const nodeEnv = String(process.env.NODE_ENV || 'development').trim();

if (nodeEnv !== 'production') {
  const generateRes = run('npx', ['prisma', 'generate'], 'non-production prisma generate');
  if (generateRes.status !== 0) {
    fail('Falha ao executar `npx prisma generate`.');
  }
  console.log('[prestart-guard] ambiente não-produção: sem migrate automático.');
  process.exit(0);
}

if (!String(process.env.DATABASE_URL || '').trim()) {
  fail('DATABASE_URL não configurado em produção.');
}

const deployRes = run('npx', ['prisma', 'migrate', 'deploy'], 'production migrate deploy');
if (deployRes.status !== 0) {
  fail(
    'Falha em `prisma migrate deploy`.\n' +
      'Rode: npm run db:deploy\n' +
      'Para gerar migration em dev: npx prisma migrate dev'
  );
}

const statusRes = run(
  'npx',
  ['prisma', 'migrate', 'status', '--schema', 'prisma/schema.prisma'],
  'production migrate status'
);

if (statusRes.status !== 0) {
  fail(
    'Schema drift/pending migrations detectado.\n' +
      'Rode: npm run db:deploy\n' +
      'Para gerar migration em dev: npx prisma migrate dev'
  );
}

console.log('[prestart-guard] produção validada: migrations aplicadas e schema consistente.');
process.exit(0);
