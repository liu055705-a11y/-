# Cloudflare Pages Deploy

Cloudflare Pages 设置：

- Framework preset: None / Static site
- Build command: `npm run build`
- Build output directory: `dist`
- Branch: `main`
- Environment variables: 当前不需要填写

SPA fallback：

- 当前 App 主要通过首页使用，不配置 `_redirects`。
- Cloudflare Pages 不使用 Netlify 风格的 `/* /index.html 200`，避免 Infinite loop detected。
- 如以后需要子路径刷新，再单独配置 Cloudflare Pages 支持的路由方案。
