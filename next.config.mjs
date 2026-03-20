// next.config.mjs
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // ✅ Next 15.5 espera um OBJETO aqui (boolean gera warning)
    serverActions: {
      // opcional: você pode ajustar limites se usar Server Actions
      // bodySizeLimit: "2mb",
    },
  },

  // Desliga typedRoutes (gera tipos com imports quebrados para app/ quando usamos src/app)
  typedRoutes: false,

  // Next.js 16 usa Turbopack por padrão no dev.
  // Declarar a chave evita o erro quando também existe configuração de webpack.
  turbopack: {},

  webpack: (config, { isServer }) => {
    // Alias @ -> src
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": path.resolve(process.cwd(), "src"),
    };

    // ✅ mata "Can't resolve 'vertx'"
    config.resolve.fallback = {
      ...config.resolve.fallback,
      vertx: false,
    };

    // ⛔ evita empacotar módulos nativos no lado do server
    if (isServer) {
      const asCommonJs = {
        ssh2: "commonjs ssh2",
        "node-ssh": "commonjs node-ssh",
      };
      if (Array.isArray(config.externals)) {
        config.externals.push(asCommonJs);
      } else {
        config.externals = [config.externals, asCommonJs].filter(Boolean);
      }
    }

    return config;
  },

  outputFileTracingRoot: path.join(__dirname),

  async rewrites() {
    return [
      { source: "/pagamentos", destination: "/pagamento.html" },
      { source: "/pagamento", destination: "/pagamento.html" },
    ];
  },

  async headers() {
    // CSP para as páginas HTML estáticas servidas do /public.
    // Nenhum unsafe-inline em script-src — todos os scripts foram movidos para arquivos .js externos.
    // style-src mantém unsafe-inline pois os HTMLs usam <style> embutidos para layout do portal.
    const staticPageCsp = [
      "default-src 'self'",
      // cdnjs.cloudflare.com é o CDN de fallback para QRious (qrious-fallback.js)
      "script-src 'self' https://cdnjs.cloudflare.com",
      // Inline styles são necessários nos HTMLs do portal captivo
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "font-src 'self'",
      "frame-ancestors 'none'",
    ].join('; ');

    // CSP report-only para o app Next.js (não bloqueia, só registra violações).
    // Usado para detectar violações sem quebrar o site enquanto ajustamos as regras.
    const appCspReportOnly = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "font-src 'self'",
    ].join('; ');

    return [
      {
        source: "/pagamento.html",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Content-Security-Policy", value: staticPageCsp },
        ],
      },
      {
        source: "/pagar.html",
        headers: [
          { key: "Content-Security-Policy", value: staticPageCsp },
        ],
      },
      {
        source: "/teste-hotspot.html",
        headers: [
          { key: "Content-Security-Policy", value: staticPageCsp },
        ],
      },
      {
        source: "/captive/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
      {
        // Report-only para todas as rotas do app — detecta violações sem bloquear
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy-Report-Only", value: appCspReportOnly },
        ],
      },
    ];
  },
};

export default nextConfig;
