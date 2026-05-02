import { calculateUtilisation } from "../src/lib/itc-utilisation";

function check(name: string, got: unknown, expected: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) {
    console.log("   expected:", JSON.stringify(expected));
    console.log("   got     :", JSON.stringify(got));
  }
}

// Test 1 — full credit covers liability, no cash. Rule 88A says IGST credit
// is exhausted FIRST (it's fungible), preserving CGST/SGST credit.
{
  const r = calculateUtilisation(
    { igst: 5000, cgst: 3000, sgst: 3000 },
    { igst: 1000, cgst: 1500, sgst: 1500 }
  );
  check("Test 1 utilised", r.utilised, { igst: 4000, cgst: 0, sgst: 0 });
  check("Test 1 cash payable", r.cashPayable, { igst: 0, cgst: 0, sgst: 0 });
  check("Test 1 balance", r.balance, { igst: 1000, cgst: 3000, sgst: 3000 });
}

// Test 2 — IGST credit overflows into CGST liability (Rule 88A)
{
  const r = calculateUtilisation(
    { igst: 10000, cgst: 0, sgst: 0 },
    { igst: 0, cgst: 4000, sgst: 4000 }
  );
  // IGST credit of 10000 used: 4000 for CGST liab + 4000 for SGST liab = 8000 used
  check("Test 2 utilised", r.utilised, { igst: 8000, cgst: 0, sgst: 0 });
  check("Test 2 cash payable", r.cashPayable, { igst: 0, cgst: 0, sgst: 0 });
  check("Test 2 balance", r.balance, { igst: 2000, cgst: 0, sgst: 0 });
}

// Test 3 — CGST credit cannot offset SGST liability
{
  const r = calculateUtilisation(
    { igst: 0, cgst: 5000, sgst: 0 },
    { igst: 0, cgst: 2000, sgst: 3000 }
  );
  // CGST credit can only pay CGST. SGST liability has to be paid in cash.
  check("Test 3 utilised", r.utilised, { igst: 0, cgst: 2000, sgst: 0 });
  check("Test 3 cash payable", r.cashPayable, { igst: 0, cgst: 0, sgst: 3000 });
  check("Test 3 balance", r.balance, { igst: 0, cgst: 3000, sgst: 0 });
}

// Test 4 — Mixed scenario with partial cash payable
{
  const r = calculateUtilisation(
    { igst: 5000, cgst: 4000, sgst: 4000 },
    { igst: 7000, cgst: 6000, sgst: 6000 }
  );
  // Step 1 (IGST liab 7000): IGST cr 5000 first -> 2000 left, CGST cr 2000 -> done.
  //   credits left: igst 0, cgst 2000, sgst 4000
  // Step 2 (CGST liab 6000): IGST cr 0, CGST cr 2000 -> 4000 unpaid (cash)
  //   credits left: cgst 0
  // Step 3 (SGST liab 6000): IGST cr 0, SGST cr 4000 -> 2000 unpaid (cash)
  //   credits left: sgst 0
  check("Test 4 utilised", r.utilised, { igst: 5000, cgst: 4000, sgst: 4000 });
  check("Test 4 cash payable", r.cashPayable, { igst: 0, cgst: 4000, sgst: 2000 });
  check("Test 4 balance", r.balance, { igst: 0, cgst: 0, sgst: 0 });
  check("Test 4 total cash", r.total.cashPayable, 6000);
}

// Test 5 — All zeros
{
  const r = calculateUtilisation({ igst: 0, cgst: 0, sgst: 0 }, { igst: 0, cgst: 0, sgst: 0 });
  check("Test 5 totals", r.total, { output: 0, available: 0, utilised: 0, cashPayable: 0, balance: 0 });
}

// Test 6 — Liability with no credit at all -> 100% cash
{
  const r = calculateUtilisation({ igst: 0, cgst: 0, sgst: 0 }, { igst: 1000, cgst: 1500, sgst: 1500 });
  check("Test 6 cash", r.cashPayable, { igst: 1000, cgst: 1500, sgst: 1500 });
  check("Test 6 balance", r.balance, { igst: 0, cgst: 0, sgst: 0 });
}
