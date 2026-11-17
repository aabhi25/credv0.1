# Preapproved Credit Eligibility

Instant pre-approved credit checks with configurable rule engines and pluggable credit bureaus.

- **Organizations and roles:** the platform hosts many organizations (e.g. NBFCs). A **superadmin** (`/superadmin`)
  creates organizations, manages their admin accounts (email or username, password, enable or disable) and can
  disable a whole organization. **Admins** only ever see their own organization's data.
- **Programs (rule engines):** one per partner group, e.g. Education or Consumer Brands. Each has its own
  bureau, criteria (min score, max DTI, max defaults, age range, approved limit) and shareable link
  `/check/<slug>`.
- **Bureaus:** Equifax, TransUnion CIBIL, CRIF High Mark and Experian behind one adapter interface, each in
  MOCK or LIVE mode.
- **Admin panel** (`/admin`), per organization: dashboard, programs, applicants (filter, search, CSV export), bulk CSV checks
  and bureau on/off switches.

## Getting started

```bash
cp .env.example .env   # then set SESSION_SECRET and the SUPERADMIN_/ADMIN_ logins
npm install
npm run setup          # creates the SQLite DB and seeds the admin + sample programs
npm run dev
```

Open http://localhost:3000/admin/login. Sign in with `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` for the
superadmin panel, or `ADMIN_EMAIL` / `ADMIN_PASSWORD` for the demo organization.

## How it works

| Piece | Where |
| --- | --- |
| Data model | `prisma/schema.prisma` |
| Rule evaluation | `src/lib/rules.ts` |
| Check pipeline (bureau → rules → record) | `src/lib/eligibility.ts` |
| Bureau adapters | `src/lib/bureaus/` |
| Public eligibility page | `src/app/check/[slug]/` |
| Admin panel | `src/app/admin/` |

Applicant data: the full PAN is never stored. Only a masked form (`XXXXX1234F`) and a SHA-256 hash are kept,
along with name, mobile, age and the result.

## Going live with a bureau

MOCK mode returns repeatable simulated reports. To use a real bureau:

1. Set `<BUREAU>_API_URL` and `<BUREAU>_API_KEY` in `.env`.
2. Implement that bureau's request and response mapping in `src/lib/bureaus/live.ts`.
3. Switch the program's API mode to LIVE.

Until step 2 is done, LIVE checks fail with a clear error rather than returning made-up data.

## Before production

- Switch Prisma to Postgres (`provider = "postgresql"` in the schema) and set `APP_URL`.
- Replace the in-memory rate limiter (`src/lib/rate-limit.ts`) with a shared store if running more than one server.
- Review consent wording and data retention with compliance.
