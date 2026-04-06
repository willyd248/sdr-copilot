# Legal Page URLs

Deployed as part of the SDR Copilot marketing site at `https://sdrcopilot.vercel.app/`.

| Page | URL |
|------|-----|
| Privacy Policy | https://sdrcopilot.vercel.app/privacy |
| Terms of Service | https://sdrcopilot.vercel.app/terms |

## Usage

- **Chrome Web Store submission** (issue #16): paste the Privacy Policy URL into the "Privacy Policy URL" field
- **manifest.json** `homepage_url`: set to `https://sdrcopilot.vercel.app/` (already done in v1.1.0)

## Source files

- `marketing/privacy/index.html` → served at `/privacy`
- `marketing/terms/index.html` → served at `/terms`
- `marketing/vercel.json` → Vercel routing config (cleanUrls: true)
