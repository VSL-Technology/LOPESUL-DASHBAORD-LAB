// lib/schemas/index.ts
/**
 * Centralized validation schemas using Zod
 * All API routes should use these schemas for request/response validation
 */

import { z } from 'zod';

// ============ Common Patterns ============

export const UuidSchema = z.string()
  .uuid('ID must be a valid UUID')
  .trim();

export const IpAddressSchema = z.string()
  .regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'Invalid IP address')
  .refine(
    (ip) => ip.split('.').every(part => Number(part) <= 255),
    'IP octets must be 0-255'
  );

export const MacAddressSchema = z.string()
  .regex(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/, 'Invalid MAC address (must be XX:XX:XX:XX:XX:XX)')
  .transform(s => s.toUpperCase());

export const EmailSchema = z.string()
  .email('Invalid email address')
  .toLowerCase()
  .trim();

export const PhoneSchema = z.string()
  .regex(/^[\d\s\-+()]{10,}$/, 'Invalid phone number');

export const CpfCnpjSchema = z.string()
  .regex(/^\d{11}|\d{14}$/, 'Invalid CPF/CNPJ')
  .transform(s => s.replace(/\D/g, ''));

// ============ Parameter Schemas ============

export const IdParamSchema = z.object({
  id: UuidSchema,
});

export const IdStatusParamSchema = z.object({
  id: UuidSchema,
});

// ============ Domain Schemas ============

// FROTA (Fleet)
export const FrotaCreateSchema = z.object({
  nome: z.string().min(1).max(255).trim(),
  placa: z.string().max(20).trim().optional(),
  rotaLinha: z.string().max(50).trim().optional(),
  observacoes: z.string().max(1000).trim().optional(),
  roteadorId: UuidSchema.optional(),
});

export const FrotaUpdateSchema = FrotaCreateSchema.partial();

// ROTEADOR (Router)
export const RoteadorCreateSchema = z.object({
  nome: z.string().min(1).max(255).trim(),
  ipLan: IpAddressSchema,
  usuario: z.string().min(1).max(255).trim(),
  senha: z.string().min(8).max(255), // Don't trim password
  portaApi: z.number().int().min(1).max(65535).optional(),
  portaSsh: z.number().int().min(1).max(65535).optional(),
  wgPublicKey: z.string().max(1024).optional(),
  wgIp: IpAddressSchema.optional(),
});

export const RoteadorUpdateSchema = z.object({
  nome: z.string().min(1).max(255).trim().optional(),
  ipLan: IpAddressSchema.optional(),
  usuario: z.string().min(1).max(255).trim().optional(),
  senha: z.string().min(8).max(255).optional(),
  portaApi: z.number().int().min(1).max(65535).optional(),
  portaSsh: z.number().int().min(1).max(65535).optional(),
  statusMikrotik: z.boolean().optional(),
  statusWireguard: z.boolean().optional(),
});

// SESSÃO (Session)
export const SessaoRevogarSchema = z.object({
  id: UuidSchema.optional(),
  ip: IpAddressSchema.optional(),
  mac: MacAddressSchema.optional(),
}).refine(
  (data) => data.id || data.ip || data.mac,
  'At least one of id, ip, or mac must be provided'
);

// PAGAMENTO (Payment)
export const CheckoutSchema = z.object({
  deviceId: z.string().min(1).trim(),
  mikId: z.string().optional(),
  plano: z.enum(['12h', '24h', '48h']),
  customerName: z.string().max(255).trim().optional(),
  customerEmail: EmailSchema.optional(),
  customerDoc: z.string().optional(),
});

export const VerificarPagamentoSchema = z.object({
  code: z.string().min(1).trim(),
  ipCliente: IpAddressSchema.optional(),
  macCliente: MacAddressSchema.optional(),
});

// LOGIN
export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(8),
  duration: z.enum(['30m', '1h', '4h', '8h', '24h', 'permanent']).optional(),
});

// DISPOSITIVO (Device)
export const DispositivoCreateSchema = z.object({
  frotaId: UuidSchema,
  ip: IpAddressSchema.optional(),
  mac: MacAddressSchema.optional(),
  nome: z.string().max(255).trim().optional(),
});

// ============ Query Params ============

export const PaginationSchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).refine(n => n > 0 && n <= 100),
  offset: z.string().regex(/^\d+$/).transform(Number).default(0),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const DateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  days: z.string().regex(/^\d+$/).transform(Number).optional(),
}).refine(
  (data) => data.startDate && data.endDate ? data.startDate < data.endDate : true,
  'startDate must be before endDate'
);

// ============ Utility Functions ============

/**
 * Safe parse with default error response
 */
export function safeParse<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, errors: result.error };
  }
}

/**
 * Extract and validate params from context
 */
export async function validateParams<T>(
  schema: z.ZodSchema<T>,
  params: Record<string, any>
): Promise<T> {
  const result = schema.safeParse(params);
  if (!result.success) {
    throw new ValidationError('Invalid parameters', result.error.issues);
  }
  return result.data;
}

// ============ Custom Error ============

export class ValidationError extends Error {
  constructor(message: string, public errors: z.ZodIssue[]) {
    super(message);
    this.name = 'ValidationError';
  }
}
