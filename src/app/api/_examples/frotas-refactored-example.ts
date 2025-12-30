// src/app/api/frotas/route.ts
/**
 * EXAMPLE: Refactored endpoint using new patterns
 * This demonstrates the new architecture with:
 * - Zod validation
 * - Error handling
 * - Logging
 * - Type safety
 * 
 * Status: REFERENCE - Not yet active
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { createRequestLogger } from '@/lib/logger';
import { withErrorHandling, NotFoundError, ValidationError } from '@/lib/api/errors';
import { PaginationSchema, FrotaCreateSchema, FrotaUpdateSchema } from '@/lib/schemas';

const log = createRequestLogger;

// ============ GET /api/frotas ============
// List all frotas with pagination

export const GET = withErrorHandling(
  async (req: NextRequest) => {
    const logger = log(req);

    // Parse and validate query params
    const { searchParams } = req.nextUrl;
    const queryData = {
      limit: searchParams.get('limit') || '10',
      offset: searchParams.get('offset') || '0',
      sort: searchParams.get('sort') || 'nome',
      order: searchParams.get('order') || 'asc',
    };

    const validatedQuery = await PaginationSchema.parseAsync(queryData).catch((err) => {
      logger.warn({ error: err.message }, 'Invalid query parameters');
      throw new ValidationError('Invalid query parameters', err.flatten().fieldErrors);
    });

    logger.debug(validatedQuery, 'Fetching frotas with pagination');

    // Query frotas
    const [frotas, total] = await Promise.all([
      prisma.frota.findMany({
        take: validatedQuery.limit,
        skip: validatedQuery.offset,
        orderBy: {
          [validatedQuery.sort || 'nome']: validatedQuery.order,
        },
        include: {
          _count: { select: { dispositivos: true, vendas: true } },
          roteador: { select: { id: true, nome: true } },
        },
      }),
      prisma.frota.count(),
    ]);

    logger.info(
      { count: frotas.length, total },
      'Successfully fetched frotas'
    );

    return NextResponse.json(
      {
        ok: true,
        data: frotas,
        pagination: {
          total,
          limit: validatedQuery.limit,
          offset: validatedQuery.offset,
          hasMore: validatedQuery.offset + validatedQuery.limit < total,
        },
      },
      {
        headers: {
          'Cache-Control': 'max-age=60, public',
        },
      }
    );
  },
  { requireAuth: true }
);

// ============ POST /api/frotas ============
// Create new frota

export const POST = withErrorHandling(
  async (req: NextRequest) => {
    const logger = log(req);

    // Parse request body
    const body = await req.json().catch(() => ({}));

    logger.debug({ body }, 'Creating new frota');

    // Validate against schema
    const validatedData = await FrotaCreateSchema.parseAsync(body).catch((err) => {
      logger.warn({ errors: err.flatten() }, 'Frota creation validation failed');
      throw new ValidationError('Invalid frota data', err.flatten().fieldErrors);
    });

    // Check if roteador exists (if provided)
    if (validatedData.roteadorId) {
      const roteador = await prisma.roteador.findUnique({
        where: { id: validatedData.roteadorId },
      });

      if (!roteador) {
        logger.warn(
          { roteadorId: validatedData.roteadorId },
          'Router not found'
        );
        throw new NotFoundError('Roteador não encontrado', 'roteador');
      }
    }

    // Create frota
    const frota = await prisma.frota.create({
      data: validatedData,
      include: {
        roteador: { select: { id: true, nome: true } },
      },
    });

    logger.info({ frotaId: frota.id }, 'Frota created successfully');

    return NextResponse.json(
      {
        ok: true,
        data: frota,
      },
      { status: 201 }
    );
  },
  { requireAuth: true }
);

// ============ PUT /api/frotas/[id] ============
// Update frota (example in separate file pattern)

export async function PUTexample(req: NextRequest, context: any) {
  const logger = log(req);

  // Get ID from context
  const { id } = await context.params;

  logger.debug({ frotaId: id }, 'Updating frota');

  // Validate ID
  const validatedId = z.string().uuid().parse(id);

  // Parse body
  const body = await req.json().catch(() => ({}));

  // Validate update data
  const validatedData = await FrotaUpdateSchema.parseAsync(body).catch((err) => {
    throw new ValidationError('Invalid frota data', err.flatten().fieldErrors);
  });

  // Check frota exists
  const frota = await prisma.frota.findUnique({ where: { id: validatedId } });
  if (!frota) {
    throw new NotFoundError('Frota não encontrada', 'frota');
  }

  // Update frota
  const updated = await prisma.frota.update({
    where: { id: validatedId },
    data: validatedData,
    include: {
      roteador: { select: { id: true, nome: true } },
    },
  });

  logger.info({ frotaId: id }, 'Frota updated successfully');

  return NextResponse.json({
    ok: true,
    data: updated,
  });
}

// ============ DELETE /api/frotas/[id] ============
// Delete frota (cascade to devices)

export async function DELETEexample(req: NextRequest, context: any) {
  const logger = log(req);

  const { id } = await context.params;
  logger.debug({ frotaId: id }, 'Deleting frota');

  const validatedId = z.string().uuid().parse(id);

  // Check frota exists
  const frota = await prisma.frota.findUnique({
    where: { id: validatedId },
    include: { _count: { select: { dispositivos: true } } },
  });

  if (!frota) {
    throw new NotFoundError('Frota não encontrada', 'frota');
  }

  if (frota._count.dispositivos > 0) {
    logger.warn(
      { frotaId: id, deviceCount: frota._count.dispositivos },
      'Cannot delete frota with devices'
    );
    throw new ValidationError('Não é possível deletar frota com dispositivos');
  }

  // Delete frota
  await prisma.frota.delete({ where: { id: validatedId } });

  logger.info({ frotaId: id }, 'Frota deleted successfully');

  return NextResponse.json({
    ok: true,
    message: 'Frota deleted',
  });
}
