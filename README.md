# CredCap AI

Instant pre-approved credit checks with configurable rule engines and pluggable credit bureaus.

- **Organizations and roles:** the platform hosts many organizations (e.g. NBFCs). A **superadmin** (`/superadmin`)
  creates organizations, manages their admin accounts (email or username, password, enable or disable), chooses
  which credit bureaus each organization can see and use, and can disable a whole organization. **Admins** only ever see their own organization's data.
- **Programs (rule engines):** one per partner group, e.g. Education or Consumer Brands. Each has its own
  bureau, criteria (min score, max DTI, max defaults, age range, approved limit) and shareable link
  `/check/<slug>`.
- **Bureaus:** Equifax, TransUnion CIBIL, CRIF High Mark and Experian behind one adapter interface. Checks always
  call the bureau live. **Equifax (IDCCR JSON API) is integrated**; the other three are not yet. Each organization
  uses its own bureau membership: a superadmin enables bureaus per organization and enters that organization's API
  credentials (stored encrypted). Until a program's bureau is live, its link shows applicants "Not available yet".
- **Admin panel** (`/admin`), per organization: dashboard, programs, applicants (filter, search, CSV export), bulk CSV checks
  and the status of their enabled bureaus.

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
along with name, mobile, age, monthly income, existing EMIs, the bureau's report reference and the result. The
address and the raw bureau report are not stored.

## Integrating a bureau

There is no simulated or mock mode. Each bureau's status is one of:

- **Not integrated:** no adapter exists yet (CIBIL, CRIF, Experian today).
- **Credentials missing:** the adapter exists but this organization has no saved API credentials.
- **Live:** checks can run.

To integrate a bureau, add an adapter to `INTEGRATIONS` in `src/lib/bureaus/index.ts` (and the code to
`INTEGRATED_BUREAUS` and `CREDENTIAL_FIELDS` in `types.ts`) that calls the bureau's API and maps the response to a
`BureauReport`. `src/lib/bureaus/equifax.ts` is the reference implementation.

### Equifax

- Request: name, DOB, address with state code and PIN, mobile and PAN, plus the program's enquiry purpose.
- Read from the report: ERS 4.0 score, total monthly EMIs, and "defaults" = accounts that were 90+ days past due,
  written off, settled, suit filed, wilful default, doubtful, loss or sub-standard in the 48-month history.
- DTI = existing EMIs ÷ the monthly income the applicant enters. No credit file (`HitCode 00`) is declined.
- Credentials are entered per organization on the superadmin organization page and encrypted with `CREDENTIALS_KEY`.
- Run `npm test` for the request/response tests. Bureau documentation goes in `vendor-docs/` (git-ignored).

## Before production

- Switch Prisma to Postgres (`provider = "postgresql"` in the schema) and set `APP_URL`.
- Replace the in-memory rate limiter (`src/lib/rate-limit.ts`) with a shared store if running more than one server.
- Review consent wording and data retention with compliance.
- Ask each bureau to allow-list the production server's IP address.
