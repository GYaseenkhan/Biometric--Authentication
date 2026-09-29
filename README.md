# SecureAI — Biometric Security Demo

A security proof-of-concept demonstrating biometric multi-factor authentication (face and/or WebAuthn passkey on web, a device-biometric key on Android and iOS), secure session management, role-based access control, encryption at rest with key rotation, hardened transit/API security, audit logging, and simulated subscription payments — plus a standalone AI/ML training-pipeline security PoC.

Built as a student deliverable for **Team 1 (Technical Security)**, per the course brief. A parallel **Team 2 (Ethics & Governance)** brief covers the policy/consent side of the same system; their inputs and the questions still open for them are in [`docs/08`](docs/08_Requests_to_Team2.md).

**Live site:** <https://d2zb1uxt99m5ks.cloudfront.net> (AWS `us-east-1`: web app on Amplify behind CloudFront, API on Elastic Beanstalk, PostgreSQL on RDS). How it is deployed and secured: [docs/01 "Where it runs"](docs/01_Security_Architecture.md#where-it-runs-live-site-as-of-2026-09-30).

## Where things live

| Path                                                                         | What it is                                                                                                                   |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [`artifacts/api-server`](artifacts/api-server)                               | Express API — auth, sessions, MFA, users, payments, uploads, privacy, security logs                                          |
| [`artifacts/secureai`](artifacts/secureai)                                   | React web frontend                                                                                                           |
| [`artifacts/mobile`](artifacts/mobile)                                       | Expo/React Native app for Android and iOS (device-biometric MFA) — see its own [README](artifacts/mobile/README.md)          |
| [`artifacts/ai-model`](artifacts/ai-model)                                   | Standalone AI/ML training-pipeline security PoC (consent, poisoning, deletion, memorisation)                                 |
| [`lib/db`](lib/db)                                                           | Drizzle ORM schema — the single source of truth for the data model                                                           |
| [`lib/api-spec`](lib/api-spec)                                               | OpenAPI spec — the single source of truth for the HTTP API                                                                   |
| [`lib/api-zod`](lib/api-zod), [`lib/api-client-react`](lib/api-client-react) | Generated from the OpenAPI spec — Zod validation + typed React Query hooks                                                   |
| [`docs/`](docs)                                                              | Security architecture, threat model and risk register, consent and deletion, mobile checklist, governance (table below)      |
| [`scripts/`](scripts)                                                        | Security testing (adversarial probes, load test, DAST) and operations (deploy, production checks) — see "Testing and checks" |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml)                       | CI on every push: typecheck + dependency audit, Semgrep SAST, and a live-server job running the load test and probes         |

## Documentation

| Doc                                                                                        | Covers                                                                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| [01 — Security Architecture](docs/01_Security_Architecture.md)                             | Components, trust boundaries, where the live site runs                                            |
| [02 — Authentication Flow](docs/02_Authentication_Flow.md)                                 | Registration, login, MFA, session lifecycle                                                       |
| [03 — Data Flow](docs/03_Data_Flow.md)                                                     | How personal and biometric data moves, including the AI/ML pipeline                               |
| [04 — Threat Model & Risk Assessment](docs/04_Threat_Model_Risk_Assessment.md)             | STRIDE analysis, the risk register (every finding and its status), OWASP mapping, testing results |
| [05 — Consent and Deletion Design](docs/05_Consent_and_Deletion_Design.md)                 | Consent model, minors and guardians, withdrawal, deletion, retention, privacy policy and export   |
| [06 — Mobile Security (MASVS) Checklist](docs/06_Mobile_Security_MASVS_Checklist.md)       | The mobile app against OWASP MASVS, Android and iOS                                               |
| [07 — Data Classification](docs/07_Data_Classification.md)                                 | Sensitivity tiers and the protection each data category gets                                      |
| [08 — Requests to Team 2](docs/08_Requests_to_Team2.md)                                    | Every question that is Team 2's to answer, what they have answered, and what is still open        |
| [09 — Data Source Acceptability Matrix](docs/09_Team2_Data_Source_Acceptability_Matrix.md) | Team 2's matrix of which data sources the AI features may use, as implemented                     |
| [10 — Production Launch Readiness](docs/10_Production_Launch_Readiness.md)                 | What a real Australian public launch would still need                                             |
| [11 — Responsible AI Governance](docs/11_Responsible_AI_Governance.md)                     | The AI system register and Team 2's 20 Responsible AI elements, element by element                |

## Quick start

```bash
pnpm install
cp .env.example .env                       # fill in DATABASE_URL and SESSION_SECRET
pnpm --filter @workspace/db run push       # create the tables

pnpm --filter @workspace/api-server run dev   # API on :8080 (seeds the demo accounts into an empty database)
pnpm --filter @workspace/secureai run dev     # web app
```

**Environment variables** for the API (see [`.env.example`](.env.example)):

| Variable                                                                        | Required?  | What it's for                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                  | Yes        | Postgres connection string                                                                                                                                                                                                  |
| `SESSION_SECRET`                                                                | Yes        | express-session secret                                                                                                                                                                                                      |
| `FILE_ENCRYPTION_KEY`                                                           | Production | AES-256 key (64 hex characters) for face templates, uploads and payment tokens at rest. Unset, a key derived from `SESSION_SECRET` is used (local development only)                                                         |
| `FILE_ENCRYPTION_KEY_ID`                                                        | No         | Name of the current key, stored with every encrypted value (default `k1`). To rotate: set a new key under a new ID, move the old one to `FILE_ENCRYPTION_PREVIOUS_KEYS`, and the API re-encrypts in the background (R-DP-3) |
| `FILE_ENCRYPTION_PREVIOUS_KEYS`                                                 | No         | Older keys still needed for reading, `k1:<hex>,k0:<hex>`; remove one once the `ENCRYPTION_KEY_ROTATED` audit event reports nothing left on it                                                                               |
| `FRONTEND_ORIGINS`                                                              | Production | Comma-separated origins allowed by CORS (the web app, and the mobile app's `EXPO_PUBLIC_APP_ORIGIN`). Local `http://localhost:<port>` origins are allowed in development                                                    |
| `WEBHOOK_SECRET`                                                                | No         | HMAC secret for payment webhook signature verification; falls back to a dev default                                                                                                                                         |
| `APP_BASE_URL`                                                                  | No         | Base URL used to build the absolute link inside password-reset/parent-consent emails; falls back to `http://localhost:<FRONTEND_PORT>`                                                                                      |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `EMAIL_FROM` | No         | Real email delivery for password-reset and parent-consent links. Leave `SMTP_HOST` unset to keep using the dev-only link returned in the API response instead                                                               |
| `CLAMD_HOST`, `CLAMD_PORT`                                                      | No         | ClamAV daemon for upload scanning (port defaults to 3310). Unset, uploads get the built-in signature checks only; set but unreachable, uploads are refused (R-DP-2)                                                         |
| `SECURITY_ALERT_WEBHOOK_URL`                                                    | No         | Where suspicious-activity alerts are posted, in addition to the security dashboard                                                                                                                                          |
| `SECURITY_LOGS_RETENTION_DAYS`, `PAYMENTS_RETENTION_DAYS`                       | No         | Retention limits; unset means kept without limit, pending Team 2's retention periods ([docs/05](docs/05_Consent_and_Deletion_Design.md) §3)                                                                                 |
| `BEHAVIOR_MODEL_DP_EPSILON`                                                     | No         | Differential-privacy budget for the behaviour model; unset turns it off ([docs/04](docs/04_Threat_Model_Risk_Assessment.md) §2.2)                                                                                           |

**Demo accounts** (all use password `Password123!`), seeded into an empty database:

| Email                                  | Role             |
| -------------------------------------- | ---------------- |
| `admin_user@prafful.com`               | admin            |
| `security_monitoring@prafful.com`      | security_analyst |
| `it_support@prafful.com`               | it_support       |
| `admin@prafful.com`, `bob@prafful.com` | user             |

None start MFA-enrolled — visit `/enroll` after logging in to set up face and/or passkey. The same accounts were seeded into the live site's database; treat this password as public there (docs/04 R-AUTH-9).

For the mobile app, see [`artifacts/mobile/README.md`](artifacts/mobile/README.md). For the AI/ML PoC: `python3 artifacts/ai-model/model_starter.py` (pure Python, no install step).

## Testing and checks

| Command                                                   | What it does                                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run typecheck`                                      | Typechecks every package                                                                                                              |
| `pnpm run ci`                                             | Typecheck plus `pnpm audit` (fails on a critical advisory), as CI runs it                                                             |
| `pnpm run format` / `pnpm run format:check`               | Prettier over the repository (generated code, lockfiles and native projects excluded in `.prettierignore`)                            |
| `pnpm --filter @workspace/scripts run security:probes`    | Adversarial probes against a running API: SQL injection, CSRF, auth bypass, IDOR, stored XSS                                          |
| `pnpm --filter @workspace/scripts run security:load-test` | Concurrency test of the login rate limiter (R-AUTH-2)                                                                                 |
| `pnpm --filter @workspace/api-server run verify:keyring`  | Encryption keyring and rotation checks (also `verify:clamd`, `verify:dp`, `verify:provenance`)                                        |
| `node scripts/security/dast/zap-local.mjs`                | Authenticated OWASP ZAP scan of a local API; needs `ZAP_HOME`; fails on any Medium or High finding                                    |
| `node scripts/check-privacy-policy-version.mjs`           | Fails if the privacy policy version differs between the web text, the mobile app and the API (runs in CI)                             |
| `node scripts/ops/check-production-db.mjs`                | Read-only production check: the app's database role has no more rights than it needs, and every encrypted value is on the current key |

Deployment is by `scripts/ops/package-api.mjs` (API bundle for Elastic Beanstalk) and `scripts/ops/deploy-web.mjs` (web app to Amplify, applying the page security headers from `scripts/ops/web-security-headers.mjs` and checking them afterwards).

## Progress tracking

Work is tracked week-by-week against the brief as [GitHub Issues](../../issues), each with a checklist mapping brief requirements to the actual files that satisfy them. The current status of every requirement, and every risk found along the way, is in the risk register in [`docs/04`](docs/04_Threat_Model_Risk_Assessment.md).

## Dataset Selection

For AI/ML experimentation, facial recognition datasets such as Labeled Faces in the Wild (LFW) were investigated. LFW provides labelled facial images suitable for identity verification and biometric authentication research.

It is not used to train or test anything in this project: the ground rule is synthetic data only. LFW matters here as the benchmark behind the face model's published accuracy (99.38% for face-api.js), and it is widely documented as demographically unbalanced, so that figure says little about any particular group of users. Accuracy and fairness on SecureAI's own users are unmeasured and recorded as a risk ([docs/11](docs/11_Responsible_AI_Governance.md) §5, docs/04 R-ML-10).

## Privacy and Consent

Biometric information is sensitive information under the Privacy Act 1988 (confirmed by Team 2 on 2026-09-26). The system:

- Obtains explicit consent: the data consent is required at sign-up, while face enrolment and each AI use are separate, optional choices, recorded with a timestamp and withdrawable at any time ([docs/05](docs/05_Consent_and_Deletion_Design.md))
- Asks a parent or guardian to confirm the account of anyone under 18
- Provides deletion (the account, or only the face template) and a download of your own data
- Records every security-relevant event in a hash-chained, tamper-evident audit log
- Encrypts stored face templates (AES-256-GCM), and passkeys and phone keys never send biometric data to the server at all

## AI/ML Data Flow

How a face sign-in reaches a decision on the web app (the mobile app and passkeys verify a signature instead and send no face data):

```text
Camera image (browser only, never uploaded)
      |
      v
Face detection and landmarks (face-api.js, in the browser)
      |
      v
Face embedding: 128 numbers (in the browser)
      |
      v
Sent to the API; compared with the enrolled template, which is stored encrypted
      |
      v
Authentication decision: same person if the distance is under 0.6 (lib/faceUtils.ts)
```
