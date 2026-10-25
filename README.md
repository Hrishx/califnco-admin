# AquaPure Admin

Standalone Next.js admin dashboard prototype for AquaPure water solutions.

## Run locally

```bash
pnpm install
pnpm dev
```

Open `/dashboard` or any supported route: `/products`, `/orders`, `/dealers`, `/services`, `/customers`, `/settings`, and `/automation`.

## Validate

```bash
pnpm exec tsc --noEmit
pnpm build
```

## Backend integration

The current app uses explicitly labelled in-memory demo data. To connect Firebase later, add Firebase Admin credentials only to a trusted server-side integration, enforce admin authorization there, and replace the repository boundary in `data/mock-data.ts` with server actions or route handlers. Do not expose service-account credentials in client code.

## Instagram automation

Run the planned workflow independently in n8n or another trusted scheduler. Google Sheets should select the next eligible product; an image and caption model should generate content; Cloudinary (or equivalent) should host a public image; Meta's official Instagram Graph API should publish it; and the workflow should write the media ID, status, timestamp, and errors back to the sheet. Keep all credentials server-side and add idempotency/duplicate checks before publishing.
