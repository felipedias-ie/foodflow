Great question! When using Next.js with `output: 'export'` for GitHub Pages (static hosting), here's what works and what doesn't:

## ✅ **What WORKS on GitHub Pages**

### Core Features
- **Static Site Generation (SSG)** - Pages pre-rendered at build time
- **Client-side routing** - Navigation with `<Link>` components
- **App Router & Pages Router** - Both work fine
- **Static assets** - Images, fonts, etc. (with `unoptimized: true` for images)
- **CSS/Tailwind** - All styling solutions work
- **TypeScript** - Full support

### Client-Side Features
- **Client-side data fetching** - `useEffect`, `fetch`, SWR, React Query, etc.
- **Client-side state management** - Redux, Zustand, Context API, Recoil
- **React hooks** - All hooks work normally
- **Browser APIs** - localStorage, sessionStorage, geolocation, etc.
- **Client-side forms** - Form handling, validation
- **External API calls** - Fetch data from third-party APIs (client-side only)

### Advanced Features
- **Dynamic imports** - Code splitting with `next/dynamic`
- **Client Components** - In App Router with `'use client'`
- **Environment variables** - `NEXT_PUBLIC_*` variables (embedded at build time)
- **Custom 404 pages** - Automatically generated
- **Internationalization (i18n)** - Client-side routing-based i18n
- **Analytics** - Client-side analytics (Google Analytics, Vercel Analytics, etc.)

## ❌ **What DOESN'T WORK on GitHub Pages**

### Server Features
- **Server-Side Rendering (SSR)** - `getServerSideProps` won't work
- **API Routes** - No `/pages/api` or `/app/api` routes
- **Server Components** - Can't do server-side data fetching in App Router
- **Server Actions** - No `'use server'` functions
- **Middleware** - No `middleware.ts` support
- **Incremental Static Regeneration (ISR)** - No `revalidate` option

### Build-Time Limitations
- **Image Optimization** - Must use `images: { unoptimized: true }`
- **Dynamic routes without pre-generation** - Must use `generateStaticParams` in App Router or `getStaticPaths` in Pages Router to pre-generate all dynamic routes
- **On-Demand Revalidation** - No `revalidatePath` or `revalidateTag`

## 📝 **Your Current Setup**

Your `next.config.js` is correctly configured:

```2:6:frontend/next.config.js
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  basePath: process.env.NODE_ENV === 'production' ? '/foodflow' : '',
};
```

This configuration:
- ✅ Enables static export
- ✅ Disables image optimization (required for static export)
- ✅ Sets the correct `basePath` for GitHub Pages subdirectory hosting

## 💡 **Best Practices for GitHub Pages**

1. **Use `getStaticProps`** (Pages Router) or static data fetching at the component level
2. **Pre-generate all dynamic routes** using `generateStaticParams` (App Router) or `getStaticPaths` (Pages Router)
3. **Client-side data fetching** for dynamic content (using SWR, React Query, or `useEffect`)
4. **Use `<Link>` components** instead of `<a>` tags for internal navigation (to respect `basePath`)
5. **Environment variables** must be prefixed with `NEXT_PUBLIC_` to be accessible in the browser
6. **Consider a headless CMS** (Contentful, Sanity, Strapi) for content management with static builds

## 🚀 **Common Patterns**

**Pattern 1: Static pages with client-side data fetching**
```typescript
'use client';
import { useEffect, useState } from 'react';

export default function Page() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    fetch('https://api.example.com/data')
      .then(res => res.json())
      .then(setData);
  }, []);
  
  return <div>{/* render data */}</div>;
}
```

**Pattern 2: Pre-generated dynamic routes**
```typescript
// app/posts/[id]/page.tsx
export async function generateStaticParams() {
  const posts = await fetch('https://api.example.com/posts').then(r => r.json());
  return posts.map((post) => ({ id: post.id }));
}

export default function Post({ params }: { params: { id: string } }) {
  return <div>Post {params.id}</div>;
}
```

The key limitation is that everything must be either pre-rendered at build time or fetched on the client side. No server-side runtime features are available.