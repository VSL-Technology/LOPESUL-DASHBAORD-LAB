export const publicMutationAllowlist = new Set([
  '/api/login',
  '/api/logout',
  '/api/webhooks/pagarme',
  '/api/pagamentos/checkout',
  '/api/payments/pix',
  '/api/payments/card',
  '/api/pix/criar',
  '/api/pagarme/order',
  '/api/verificar-pagamento',
  '/api/sessao/init',
]);
