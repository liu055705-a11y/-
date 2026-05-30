# Netlify Deploy

This is a static PWA deployment. No backend or AI API is used in the first stage.

## Settings

- Build command: `npm run build`
- Publish directory: `dist`

## Notes

- The production app is served from Netlify, not from `localhost` or a local Wi-Fi address.
- `.env.example` only reserves `API_BASE_URL` for a future backend.
- `outputs/打开托福复习App.command` remains a local preview helper and is not used by Netlify.
