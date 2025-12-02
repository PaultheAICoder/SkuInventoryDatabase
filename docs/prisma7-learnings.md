# Tech Stack Migration Learnings

This document captures important differences and gotchas for the tech stack used in this project.

---

# Prisma 7 Migration Learnings

This document captures important differences and gotchas when using Prisma 7 (released November 2025) compared to earlier versions.

## Key Breaking Changes

### 1. ESM Module System Required
Prisma 7 ships as an ESM module. You **must** set `"type": "module"` in `package.json`.

### 2. Minimum Requirements
- **Node.js**: 20.19.0+ (22.x recommended)
- **TypeScript**: 5.4.0+ (5.9.x recommended)

### 3. Datasource URL Migration
The `url` property in the `datasource` block is **no longer supported** in the schema file.

**Old (Prisma 6):**
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")  // ❌ No longer works
}
```

**New (Prisma 7):**
```prisma
datasource db {
  provider = "postgresql"  // No URL here
}
```

Instead, configure the URL in `prisma.config.ts`:
```typescript
import path from 'node:path'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  migrate: {
    async url() {
      return process.env.DATABASE_URL ?? ''
    },
  },
})
```

### 4. Database Adapter Required
PrismaClient now requires a database-specific adapter. Environment variables no longer load automatically.

**Old (Prisma 6):**
```typescript
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()  // Just works
```

**New (Prisma 7):**
```typescript
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL ?? ''
const adapter = new PrismaPg(connectionString)
const prisma = new PrismaClient({ adapter })
```

**Required packages by database:**
- PostgreSQL: `@prisma/adapter-pg`
- SQLite: `@prisma/adapter-better-sqlite3`
- MySQL: `@prisma/adapter-mysql`

### 5. Generator Provider Change
The old `prisma-client-js` provider is deprecated. Use `prisma-client` for the new Rust-free client.

**Old:**
```prisma
generator client {
  provider = "prisma-client-js"
}
```

**New (recommended):**
```prisma
generator client {
  provider = "prisma-client"
  output   = "./generated/prisma/client"
}
```

Note: If using `prisma-client`, you must specify an output path.

### 6. Removed Features
- Client middleware API (use Client Extensions instead)
- Metrics preview feature
- Several Prisma-specific environment variables

## Quick Migration Checklist

1. [ ] Update `package.json` with `"type": "module"`
2. [ ] Install Prisma 7: `npm install @prisma/client@7 prisma@7`
3. [ ] Install database adapter: `npm install @prisma/adapter-pg`
4. [ ] Create `prisma.config.ts` with migration URL
5. [ ] Remove `url` from datasource block in schema
6. [ ] Update PrismaClient instantiation to use adapter
7. [ ] Consider switching to `prisma-client` generator
8. [ ] Run `npx prisma generate`

## References

- [Prisma 7 Upgrade Guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7)
- [Prisma 7 Release Announcement](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0)
- [GitHub Releases](https://github.com/prisma/prisma/releases)

---

# Tailwind CSS 4 Migration Learnings

Tailwind CSS 4 (released 2025) has significant breaking changes from v3.

## Key Breaking Changes

### 1. PostCSS Plugin Moved
The PostCSS plugin is now in a separate package.

**Old (Tailwind 3) - postcss.config.js:**
```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

**New (Tailwind 4):**
```javascript
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

### 2. CSS Import Syntax Changed
The `@tailwind` directives have been replaced with CSS imports.

**Old (Tailwind 3):**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**New (Tailwind 4):**
```css
@import "tailwindcss";
```

### 3. Theme Configuration Moved to CSS
Theme customization now happens in CSS with the `@theme` directive instead of `tailwind.config.ts`.

**New approach:**
```css
@import "tailwindcss";

@theme {
  --color-primary: hsl(222.2 47.4% 11.2%);
  --color-secondary: hsl(210 40% 96.1%);
  /* etc. */
}
```

### 4. CSS Variables for Custom Colors
Instead of using `hsl(var(--color-name))` pattern with the old config, colors are defined directly in the `@theme` block.

### 5. `@apply` Still Works
The `@apply` directive still works but should reference the new theme variables.

### 6. darkMode Config Changed
The `darkMode` config option has changed format.

**Old:**
```javascript
darkMode: ['class']
```

**New:**
```javascript
darkMode: 'class'
```

## Quick Migration Checklist

1. [ ] Install `@tailwindcss/postcss` package
2. [ ] Update `postcss.config.js` to use the new plugin
3. [ ] Replace `@tailwind` directives with `@import "tailwindcss"`
4. [ ] Move theme customization to `@theme` block in CSS
5. [ ] Update CSS variable references
6. [ ] Update `darkMode` config if using class-based dark mode

## References

- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs)
