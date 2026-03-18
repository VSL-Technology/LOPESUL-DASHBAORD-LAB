export function isPublicRoute(pathname: string) {
  return [
    '/api/health/public',
    '/api/health/live',
    '/api/health/ready',
  ].includes(pathname);
}
