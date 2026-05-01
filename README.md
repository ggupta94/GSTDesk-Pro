# GSTDesk Pro

GST management web app for a CA office (50–200 clients). Tracks GST returns,
input tax credit, generates GST-compliant tax invoices, and provides quick
GST/HSN lookups.

## Stack

- **Next.js 15** (App Router, TypeScript) on port **2729**
- **Tailwind CSS** for UI
- **Prisma** ORM, **SQLite** for dev (Postgres-ready for prod)
- **iron-session** + **bcryptjs** for auth (3 roles: CA / Article / Staff)

## Modules

1. **Client Management** — GSTIN validation (state code + PAN + checksum), search/filter
2. **GST Return Tracker** — GSTR-1 / 3B / 9 / 2B with auto-computed due dates
3. **ITC Tracker** — IGST/CGST/SGST availability, utilisation %, eligibility flags (Rule 38)
4. **Invoice Generator** — GST-compliant tax invoices, auto intra/inter-state detection, print-ready PDF
5. **GST Calculator** — inclusive/exclusive at all slabs (0, 0.1, 0.25, 3, 5, 12, 18, 28%)
6. **HSN/SAC Lookup** — searchable code reference table
7. **Dashboard** — pending/filed/overdue counts, ITC pool, upcoming due dates
8. **GSTN Portal Lookup** — stubbed; wire to GSP provider when API key available

## Getting started

```bash
# 1. Install deps
npm install

# 2. Initialize the DB (SQLite at prisma/dev.db)
npx prisma db push

# 3. Seed default users + HSN codes + sample clients
npm run db:seed

# 4. Run on http://localhost:2729
npm run dev
```

### Default logins (after seeding)

| Username  | Password   | Role              |
| --------- | ---------- | ----------------- |
| `ca`      | `password` | Chartered Accountant (full access) |
| `article` | `password` | Article Assistant (edit, no delete) |
| `staff`   | `password` | Office Staff (read-only) |

**Change passwords immediately** via the Users page (CA only).

## Project layout

```
prisma/
  schema.prisma          # all models
  seed.ts                # default users + HSN data
src/
  app/
    layout.tsx           # root
    page.tsx             # redirects to /login or /dashboard
    login/               # login page (Server Action)
    (app)/               # authenticated routes (with sidebar)
      dashboard/
      clients/
      returns/
      itc/
      invoices/
      calculator/
      hsn/
      gstn-lookup/
      users/
      activity/
    invoices/[id]/print/ # standalone print-only route (no chrome)
    api/
      auth/logout/
      gstn-lookup/       # stub; wire to GSP here
  lib/
    auth.ts              # session, password, activity log helpers
    db.ts                # Prisma client singleton
    gstin.ts             # GSTIN validation + checksum
    gst.ts               # tax calc + due-date calc
    state-codes.ts       # GST state code -> name
    hsn-data.ts          # seed HSN/SAC reference codes
    amount-in-words.ts   # INR words formatter
    constants.ts         # roles, return types, permissions
```

## Deploying to a Linux VPS (Node + nginx)

1. Install Node 20 LTS on the VPS.
2. `git clone … && cd gstdesk-pro && npm ci`
3. Switch the `datasource db` provider in `prisma/schema.prisma` from `sqlite` → `postgresql`,
   set `DATABASE_URL`, then `npx prisma db push && npm run db:seed`.
4. Set `SESSION_SECRET` to a long random string (≥ 32 chars) in `.env`.
5. Build & start: `npm run build && npm run start` (port 2729; change with `-p` in `package.json`).
6. Run under `pm2` or a systemd unit for auto-restart.
7. nginx reverse-proxy from 80/443 → `127.0.0.1:2729`.

## Wiring the live GSTN lookup

Edit `src/app/api/gstn-lookup/route.ts` and replace the stub with a call to your GSP provider
(ClearTax, Masters India, KDK, etc.). Keep the local-validation fallback for offline use.
