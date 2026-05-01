// Add demo returns + ITC records so the dashboard has content to render.
// Idempotent — safe to re-run.
import { PrismaClient } from "@prisma/client";
import { calculateDueDate, deriveStatus } from "../src/lib/gst";
import { addDays } from "date-fns";

const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany({ take: 2 });
  if (clients.length === 0) {
    console.log("No clients yet — run `npm run db:seed` first.");
    return;
  }

  const now = new Date();
  const periods = [
    `${now.getFullYear()}-${String(now.getMonth() - 1).padStart(2, "0")}`, // last month
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`, // current period (filing for previous)
    `${now.getFullYear()}-${String(Math.max(1, now.getMonth())).padStart(2, "0")}`,
  ];

  let returnsCreated = 0;
  let itcCreated = 0;

  for (const c of clients) {
    for (const period of periods) {
      for (const type of ["GSTR1", "GSTR3B"] as const) {
        const due = calculateDueDate(type, period, c.filingFrequency as "MONTHLY" | "QUARTERLY");
        const status = deriveStatus(null, due);
        // randomly mark some as filed
        const filedAt = Math.random() < 0.5 ? addDays(due, -2) : null;
        try {
          await prisma.return.create({
            data: {
              clientId: c.id,
              type,
              period,
              dueDate: due,
              status: filedAt ? "FILED" : status,
              filedAt,
              arn: filedAt ? `ARN${Math.floor(Math.random() * 1e10)}` : null,
            },
          });
          returnsCreated++;
        } catch {
          // unique constraint — skip
        }
      }
    }
    // ITC entry for current period
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    try {
      await prisma.iTCRecord.create({
        data: {
          clientId: c.id,
          period,
          igstAvailable: 50000 + Math.floor(Math.random() * 50000),
          cgstAvailable: 30000 + Math.floor(Math.random() * 30000),
          sgstAvailable: 30000 + Math.floor(Math.random() * 30000),
          igstUtilised: 20000 + Math.floor(Math.random() * 20000),
          cgstUtilised: 15000 + Math.floor(Math.random() * 10000),
          sgstUtilised: 15000 + Math.floor(Math.random() * 10000),
          eligibility: "FULLY_ELIGIBLE",
        },
      });
      itcCreated++;
    } catch {
      // already exists for this period
    }
  }

  // Force one return into overdue
  const overdueDue = addDays(now, -10);
  try {
    await prisma.return.create({
      data: {
        clientId: clients[0].id,
        type: "GSTR1",
        period: "2025-01",
        dueDate: overdueDue,
        status: "OVERDUE",
      },
    });
    returnsCreated++;
  } catch {
    /* exists */
  }

  console.log(`✓ Demo returns: +${returnsCreated}`);
  console.log(`✓ Demo ITC entries: +${itcCreated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
