// src/lib/rateLimit.ts
// Rate limiting com Redis (sliding window counter).
// Se REDIS_URL não estiver configurado, usa fallback em memória automaticamente.
import Redis from 'ioredis';

// ─── Singleton Redis ──────────────────────────────────────────────────────────

let redisClient: Redis | null = null;
let redisConnectFailed = false;

function shouldLogRedisFallback(err: unknown) {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const isExpectedLocalError =
    message.includes('ENOTFOUND') || message.includes('ETIMEDOUT');

  return !isExpectedLocalError || process.env.NODE_ENV !== 'development';
}

function getRedis(): Redis | null {
  if (redisConnectFailed) return null;
  if (!process.env.REDIS_URL) return null;

  if (!redisClient) {
    try {
      redisClient = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true,
        enableOfflineQueue: false,
      });

      redisClient.on('error', (err) => {
        if (shouldLogRedisFallback(err)) {
          console.warn(
            '[RATE_LIMIT] Redis connection error — falling back to in-memory',
            err?.message ?? err
          );
        }
        redisConnectFailed = true;
        redisClient = null;
      });
    } catch (err) {
      console.error('[RATE_LIMIT] Failed to create Redis client — using in-memory fallback', (err as Error)?.message ?? err);
      redisConnectFailed = true;
      return null;
    }
  }

  return redisClient;
}

// ─── In-memory fallback ───────────────────────────────────────────────────────

const memBuckets = new Map<string, { count: number; expiresAt: number }>();

function memRateLimit(key: string, limit: number, windowSecs: number): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const bucket = memBuckets.get(key);

  if (!bucket || now > bucket.expiresAt) {
    memBuckets.set(key, { count: 1, expiresAt: now + windowSecs * 1000 });
    return { allowed: true, remaining: limit - 1, resetIn: windowSecs };
  }

  bucket.count += 1;
  const allowed = bucket.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    resetIn: Math.ceil((bucket.expiresAt - now) / 1000),
  };
}

// ─── Redis sliding window ─────────────────────────────────────────────────────

async function redisRateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSecs: number
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const now = Date.now();
  const windowStart = now - windowSecs * 1000;
  const redisKey = `rl:${key}`;

  const pipe = redis.pipeline();
  pipe.zremrangebyscore(redisKey, 0, windowStart);
  pipe.zadd(redisKey, now, `${now}-${Math.random().toString(36).slice(2)}`);
  pipe.zcard(redisKey);
  pipe.expire(redisKey, windowSecs);
  const results = await pipe.exec();

  const count = (results?.[2]?.[1] as number) ?? 0;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetIn: windowSecs,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RateLimitParams {
  /** Chave única — ex: "ip:192.168.1.1", "webhook:10.0.0.1", "user:uuid" */
  key: string;
  /** Número máximo de requisições permitidas na janela */
  limit: number;
  /** Tamanho da janela em segundos */
  windowSecs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
}

/**
 * Verifica o rate limit para a chave dada.
 * Usa Redis sliding window se disponível, fallback para in-memory caso contrário.
 */
export async function rateLimit(params: RateLimitParams): Promise<RateLimitResult> {
  const { key, limit, windowSecs } = params;

  const redis = getRedis();
  if (redis) {
    try {
      return await redisRateLimit(redis, key, limit, windowSecs);
    } catch (err) {
      if (shouldLogRedisFallback(err)) {
        console.warn(
          '[RATE_LIMIT] Redis connection error — falling back to in-memory',
          (err as Error)?.message ?? err
        );
      }
      redisConnectFailed = true;
      redisClient = null;
    }
  }

  // Fallback in-memory
  return memRateLimit(key, limit, windowSecs);
}

/**
 * Conveniência: rateLimit com windowMs (para compatibilidade com os helpers antigos).
 */
export async function rateLimitMs(params: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  return rateLimit({
    key: params.key,
    limit: params.limit,
    windowSecs: Math.ceil(params.windowMs / 1000),
  });
}
