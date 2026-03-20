#!/bin/bash
# install-deps.sh - Install all new dependencies for refactoring
# Usage: bash install-deps.sh

set -e

echo "🚀 Installing Refactoring Dependencies..."
echo ""

# Core dependencies
echo "📦 Installing core dependencies..."
npm install \
  zod \
  react-hook-form \
  @hookform/resolvers \
  @tanstack/react-query \
  pino \
  pino-pretty \
  sanitize-html \
  xss \
  next-auth@5.0.0-beta.20 \
  jose

# Optional but recommended
echo "📦 Installing optional security/performance deps..."
npm install \
  @upstash/ratelimit \
  @upstash/redis \
  bcryptjs

# Dev dependencies
echo "📦 Installing dev dependencies..."
npm install --save-dev \
  jest \
  ts-jest \
  @testing-library/react \
  @testing-library/jest-dom \
  @types/jest \
  @types/node \
  typescript \
  ts-node \
  eslint \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser \
  prettier \
  @playwright/test

# Generate Prisma types
echo "🔧 Generating Prisma types..."
npx prisma generate

echo "✅ Dependencies installed successfully!"
echo ""
echo "📝 Next steps:"
echo "1. Update tsconfig.json to set 'allowJs: false'"
echo "2. Create lib/schemas/index.ts (already created)"
echo "3. Create lib/auth.ts for NextAuth setup"
echo "4. Update middleware.js to use NextAuth"
echo "5. Run: npm run type-check"
echo ""
