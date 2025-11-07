# FoodFlow Frontend

A Next.js application configured for GitHub Pages deployment with static export.

## Features

- Next.js 15 with App Router
- TypeScript
- Tailwind CSS v4
- Static Export (no SSR)
- GitHub Actions deployment

## Development

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`

## Build

```bash
npm run build
```

The static site will be generated in the `out` directory.

## Deployment

Push to `main` branch and GitHub Actions will automatically build and deploy to GitHub Pages.

The site will be available at: `https://USERNAME.github.io/foodflow-git`

## Configuration

- `next.config.js` - Static export and basePath configuration
- `postcss.config.mjs` - Tailwind CSS v4 PostCSS setup
- `.github/workflows/pages.yml` - GitHub Actions deployment workflow
- `public/.nojekyll` - Prevents Jekyll processing on GitHub Pages

