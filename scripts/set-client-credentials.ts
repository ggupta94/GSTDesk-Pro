// One-shot helper: set portal creds on the seeded clients so we can verify
// encryption + display end-to-end. Use the UI for real edits going forward.
import { PrismaClient } from "@prisma/client";
import { encryptSecret, decryptSecret } from "../src/lib/crypto";

const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany({ take: 2 });
  for (const c of clients) {
    const username = `${c.legalName.split(" ")[0].toLowerCase()}_gstn`;
    const password = `Demo@${c.gstin.slice(-4)}!`;
    await prisma.client.update({
      where: { id: c.id },
      data: {
        gstPortalUsername: username,
        gstPortalPasswordEnc: encryptSecret(password),
      },
    });
    console.log(`✓ ${c.legalName}: user=${username}, pass=${password}`);
    // round-trip verification
    const fresh = await prisma.client.findUnique({ where: { id: c.id } });
    const decrypted = decryptSecret(fresh?.gstPortalPasswordEnc);
    console.log(`  round-trip: ${decrypted === password ? "OK" : "MISMATCH"}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
