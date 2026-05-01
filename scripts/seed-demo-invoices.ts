// Seed sample invoices spread across the last 12 months for the existing clients.
// Idempotent (won't create dupes — uses a deterministic invoiceNumber prefix).
import { PrismaClient } from "@prisma/client";
import { addDays, subMonths, startOfMonth } from "date-fns";
import { amountInWords } from "../src/lib/amount-in-words";

const prisma = new PrismaClient();

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

async function main() {
  const clients = await prisma.client.findMany({ take: 5 });
  if (clients.length === 0) {
    console.log("No clients yet — run `npm run db:seed` first.");
    return;
  }

  let created = 0;
  let skipped = 0;
  const now = new Date();

  for (const client of clients) {
    // 1–4 invoices per month for the last 12 months
    for (let m = 11; m >= 0; m--) {
      const monthStart = startOfMonth(subMonths(now, m));
      const count = 1 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        const date = addDays(monthStart, Math.floor(Math.random() * 28));
        const seq = `${monthStart.getFullYear()}${String(monthStart.getMonth() + 1).padStart(2, "0")}-${i + 1}`;
        const invoiceNumber = `${client.legalName.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, "X")}-${seq}-${client.id.slice(-4)}`;

        const exists = await prisma.invoice.findUnique({ where: { invoiceNumber } });
        if (exists) {
          skipped++;
          continue;
        }

        // random buyer; ~40% inter-state
        const interState = Math.random() < 0.4;
        const buyerStateCode = interState
          ? client.stateCode === "27" ? "29" : "27"
          : client.stateCode;

        // 1–4 line items
        const lineCount = 1 + Math.floor(Math.random() * 4);
        const itemsData = Array.from({ length: lineCount }).map(() => {
          const qty = 1 + Math.floor(Math.random() * 50);
          const rate = 100 + Math.floor(Math.random() * 4900);
          const gstRate = [5, 12, 18, 28][Math.floor(Math.random() * 4)];
          const taxable = r2(qty * rate);
          const tax = r2(taxable * (gstRate / 100));
          const cgst = interState ? 0 : r2(tax / 2);
          const sgst = interState ? 0 : r2(tax / 2);
          const igst = interState ? tax : 0;
          return {
            description: ["Widget Type A", "Service Bundle", "Component Kit", "Maintenance Hours", "Licence"][
              Math.floor(Math.random() * 5)
            ],
            hsnSac: ["8471", "9954", "8517", "9982", "9983"][Math.floor(Math.random() * 5)],
            quantity: qty,
            unit: "Nos",
            rate,
            taxableValue: taxable,
            gstRate,
            cgstAmount: cgst,
            sgstAmount: sgst,
            igstAmount: igst,
            cessAmount: 0,
            lineTotal: r2(taxable + cgst + sgst + igst),
          };
        });

        const subTotal = r2(itemsData.reduce((s, x) => s + x.taxableValue, 0));
        const totalCgst = r2(itemsData.reduce((s, x) => s + x.cgstAmount, 0));
        const totalSgst = r2(itemsData.reduce((s, x) => s + x.sgstAmount, 0));
        const totalIgst = r2(itemsData.reduce((s, x) => s + x.igstAmount, 0));
        const grandTotal = r2(subTotal + totalCgst + totalSgst + totalIgst);

        await prisma.invoice.create({
          data: {
            invoiceNumber,
            invoiceDate: date,
            clientId: client.id,
            buyerName: ["Reliable Traders Pvt Ltd", "Vega Systems LLP", "Northstar Industries", "BlueOcean Distributors", "Pinnacle Retail Co"][
              Math.floor(Math.random() * 5)
            ],
            buyerStateCode,
            placeOfSupply: buyerStateCode === client.stateCode ? client.state : "Out of State",
            supplyType: interState ? "INTER_STATE" : "INTRA_STATE",
            subTotal,
            totalCgst,
            totalSgst,
            totalIgst,
            totalCess: 0,
            grandTotal,
            amountInWords: amountInWords(grandTotal),
            items: { create: itemsData },
          },
        });
        created++;
      }
    }
  }

  console.log(`✓ Demo invoices: +${created} (skipped ${skipped} dupes)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
