# Cloudflare Pages Deploy

Cloudflare Pages 设置：

- Framework preset: None / Static site
- Build command: `npm run build`
- Build output directory: `dist`
- Branch: `main`
- Environment variables: 当前不需要填写

SPA fallback：

- 已在 `outputs/toefl-app/_redirects` 预留 Cloudflare Pages fallback。
- 构建时会复制到 `dist/_redirects`。
- 规则：`/* /index.html 200`
