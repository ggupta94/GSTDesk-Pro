import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { HSN_SEED } from "../src/lib/hsn-data";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding GSTDesk Pro…");

  // ─── default users ───
  const users = [
    { username: "ca", fullName: "Chief CA", role: "CA" },
    { username: "article", fullName: "Article Assistant", role: "ARTICLE" },
    { username: "staff", fullName: "Office Staff", role: "STAFF" },
  ] as const;

  for (const u of users) {
    const passwordHash = await bcrypt.hash("password", 10);
    await prisma.user.upsert({
      where: { username: u.username },
      update: { fullName: u.fullName, role: u.role },
      create: { ...u, passwordHash, isActive: true },
    });
  }
  console.log(`✓ Users (3) — login with username + password "password"`);

  // ─── HSN/SAC reference codes ───
  for (const h of HSN_SEED) {
    await prisma.hsnSacCode.upsert({
      where: { code: h.code },
      update: { description: h.description, gstRate: h.gstRate, type: h.type },
      create: h,
    });
  }
  console.log(`✓ HSN/SAC codes (${HSN_SEED.length})`);

  // ─── sample clients (only if no clients exist yet) ───
  const existing = await prisma.client.count();
  if (existing === 0) {
    await prisma.client.createMany({
      data: [
        {
          legalName: "Acme Manufacturing Pvt Ltd",
          tradeName: "Acme",
          gstin: "27AAACA1111A1ZS",
          pan: "AAACA1111A",
          stateCode: "27",
          state: "Maharashtra",
          sector: "Manufacturing",
          turnoverCrore: 12.5,
          filingFrequency: "MONTHLY",
          registrationType: "REGULAR",
          contactName: "Rohit Sharma",
          contactEmail: "rohit@acme.example.com",
          contactPhone: "9876543210",
          city: "Pune",
          pincode: "411001",
        },
        {
          legalName: "Bharat Tech Services LLP",
          tradeName: "Bharat Tech",
          gstin: "29AABCB2222B1ZE",
          pan: "AABCB2222B",
          stateCode: "29",
          state: "Karnataka",
          sector: "IT Services",
          turnoverCrore: 4.2,
          filingFrequency: "QUARTERLY",
          registrationType: "REGULAR",
          contactName: "Priya Iyer",
          contactEmail: "priya@bharattech.example.com",
          contactPhone: "9123456780",
          city: "Bengaluru",
          pincode: "560001",
        },
      ],
    });
    console.log("✓ Sample clients (2)");
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
