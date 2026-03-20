// scripts/populate-router-identity.mjs
// Popula Roteador.identity a partir do nome (BUSxx), evitando duplicados.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function extractIdentityFromName(nome) {
  if (!nome || typeof nome !== "string") return null;
  const m = nome.toUpperCase().match(/\bBUS\d{1,2}\b/); // BUS1..BUS99
  return m ? m[0] : null;
}

async function main() {
  const rows = await prisma.roteador.findMany({
    select: { id: true, nome: true, identity: true },
  });

  const used = new Set(
    rows
      .map((r) => (r.identity ? String(r.identity).toUpperCase() : null))
      .filter(Boolean)
  );

  const toUpdate = rows
    .filter((r) => !r.identity)
    .map((r) => {
      const identity = extractIdentityFromName(r.nome);
      return { id: r.id, nome: r.nome, identity };
    });

  const missing = toUpdate.filter((x) => !x.identity);
  if (missing.length) {
    console.log("\n[WARN] Não consegui extrair identity do nome para:");
    for (const m of missing) console.log(`- id=${m.id} nome=${JSON.stringify(m.nome)}`);
    console.log("\nPreencha manualmente estes antes de tornar identity NOT NULL.\n");
  }

  const candidates = toUpdate.filter((x) => x.identity);
  let updated = 0;

  for (const c of candidates) {
    const idUpper = c.identity.toUpperCase();
    if (used.has(idUpper)) {
      console.log(`[SKIP] identity duplicada detectada (${idUpper}) em id=${c.id} nome=${JSON.stringify(c.nome)}`);
      continue;
    }

    await prisma.roteador.update({
      where: { id: c.id },
      data: { identity: idUpper },
    });

    used.add(idUpper);
    updated++;
    console.log(`[OK] id=${c.id} -> identity=${idUpper}`);
  }

  console.log(`\nDone. Updated: ${updated}. Missing: ${missing.length}.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
