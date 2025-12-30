// lib/api/errors.ts
/**
 * Centralized error handling for API routes
 */

import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { logger } from '../logger';

// ============ Custom Error Classes ============

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: Record<string, any>) {
    super(400, message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ApiError {
  constructor(message = 'Forbidden') {
    super(403, message, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Not found', resource?: string) {
    super(404, message, 'NOT_FOUND', { resource });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(409, message, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends ApiError {
  constructor(retryAfter?: number) {
    super(429, 'Too many requests', 'RATE_LIMIT', { retryAfter });
    this.name = 'RateLimitError';
  }
}

export class InternalServerError extends ApiError {
  constructor(message = 'Internal server error', requestId?: string) {
    super(500, message, 'INTERNAL_ERROR', { requestId });
    this.name = 'InternalServerError';
  }
}

// ============ Error Formatters ============

function formatZodError(error: ZodError) {
  const formatted = error.issues.reduce((acc, err) => {
    const path = err.path.map(String).join('.');
    acc[path] = err.message;
    return acc;
  }, {} as Record<string, string>);

  return formatted;
}

// ============ Error Response Builder ============

export function createErrorResponse(
  error: Error | ApiError,
  requestId?: string
) {
  const isProduction = process.env.NODE_ENV === 'production';

  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let details: Record<string, any> | undefined;

  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = formatZodError(error);
  } else {
    // Generic error - don't expose details in production
    message = isProduction ? 'Internal server error' : error.message;
  }

  const response = {
    ok: false,
    error: message,
    code,
    ...(details && { details }),
    ...(requestId && { requestId }),
  };

  return {
    statusCode,
    body: response,
  };
}

// ============ Handler Wrapper ============

export type ApiHandlerOptions = {
  requireAuth?: boolean;
  requireAdmin?: boolean;
  rateLimit?: {
    windowMs: number;
    maxRequests: number;
  };
};

/**
 * Wraps API handler with error handling, logging, and optional middleware
 */
export function withErrorHandling(
  handler: (req: NextRequest, context: any) => Promise<NextResponse>,
  options: ApiHandlerOptions = {}
) {
  return async function wrappedHandler(req: NextRequest, context: any) {
    const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
    const log = logger.child({ requestId });

    try {
      log.debug(
        { method: req.method, path: req.nextUrl.pathname },
        'Incoming request'
      );

      const response = await handler(req, context);

      log.debug(
        { status: response.status, method: req.method },
        'Request completed'
      );

      // Add request ID to response
      response.headers.set('x-request-id', requestId);

      return response;
    } catch (error) {
      const { statusCode, body } = createErrorResponse(error, requestId);

      log.error(
        {
          error,
          statusCode,
          method: req.method,
          path: req.nextUrl.pathname,
        },
        'Request failed'
      );

      return NextResponse.json(body, {
        status: statusCode,
        headers: { 'x-request-id': requestId },
      });
    }
  };
}

// ============ Middleware-style Error Catcher ============

export function errorCatcher(handler: Function) {
  return async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      const { statusCode, body } = createErrorResponse(error);
      return NextResponse.json(body, { status: statusCode });
    }
  };
}
