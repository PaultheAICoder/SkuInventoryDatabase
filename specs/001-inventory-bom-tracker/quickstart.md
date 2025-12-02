# Quickstart: V1 Inventory & BOM Tracker

**Date**: 2025-12-01
**Branch**: `001-inventory-bom-tracker`

## Prerequisites

- Docker and Docker Compose installed
- Node.js 20+ (for local development)
- Git

## Quick Start (Production)

### 1. Clone and Configure

```bash
git clone <repository-url>
cd trevor-inventory

# Copy environment template
cp .env.example .env

# Edit .env with your settings
# Required: DATABASE_URL, NEXTAUTH_SECRET
```

### 2. Generate Secrets

```bash
# Generate NEXTAUTH_SECRET
openssl rand -base64 32
```

### 3. Start with Docker

```bash
# Build and start all services
docker-compose -f docker/docker-compose.prod.yml up -d

# Run database migrations
docker-compose -f docker/docker-compose.prod.yml exec app npx prisma migrate deploy

# Create admin user (first time only)
docker-compose -f docker/docker-compose.prod.yml exec app npx prisma db seed
```

### 4. Access the Application

Open `http://your-server:3000` in your browser.

Default admin credentials (change immediately):
- Email: `admin@tonsil.tech`
- Password: `changeme123`

---

## Local Development

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Database

```bash
docker-compose -f docker/docker-compose.yml up -d db
```

### 3. Configure Environment

```bash
cp .env.example .env.local

# Set DATABASE_URL to local Docker PostgreSQL:
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/inventory?schema=public"
```

### 4. Initialize Database

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed initial data
npx prisma db seed
```

### 5. Start Development Server

```bash
npm run dev
```

Open `http://localhost:3000`

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| NEXTAUTH_SECRET | Yes | Random secret for session encryption |
| NEXTAUTH_URL | No | Base URL (default: http://localhost:3000) |

### Example .env

```env
DATABASE_URL="postgresql://postgres:postgres@db:5432/inventory?schema=public"
NEXTAUTH_SECRET="your-generated-secret-here"
NEXTAUTH_URL="http://localhost:3000"
```

---

## Common Tasks

### View Database

```bash
# Open Prisma Studio (GUI database browser)
npx prisma studio
```

### Run Migrations

```bash
# Development (creates migration file)
npx prisma migrate dev --name "description"

# Production (applies existing migrations)
npx prisma migrate deploy
```

### Reset Database

```bash
# WARNING: Destroys all data
npx prisma migrate reset
```

### Run Tests

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# All tests with coverage
npm run test:coverage
```

### Build for Production

```bash
npm run build
```

---

## Docker Commands

### View Logs

```bash
docker-compose -f docker/docker-compose.prod.yml logs -f app
docker-compose -f docker/docker-compose.prod.yml logs -f db
```

### Stop Services

```bash
docker-compose -f docker/docker-compose.prod.yml down
```

### Backup Database

```bash
docker-compose -f docker/docker-compose.prod.yml exec db \
  pg_dump -U postgres inventory > backup_$(date +%Y%m%d).sql
```

### Restore Database

```bash
docker-compose -f docker/docker-compose.prod.yml exec -T db \
  psql -U postgres inventory < backup_20250101.sql
```

---

## First-Time Setup Checklist

After deploying:

1. [ ] Log in as admin
2. [ ] Change admin password in Settings
3. [ ] Create additional users with appropriate roles
4. [ ] Create the company (auto-created as "Tonsil Tech")
5. [ ] Import components via CSV or create manually
6. [ ] Create SKUs
7. [ ] Define BOMs for each SKU
8. [ ] Set initial inventory via Receipt transactions or CSV import

---

## Troubleshooting

### Database Connection Failed

```bash
# Check database is running
docker-compose -f docker/docker-compose.prod.yml ps

# Check database logs
docker-compose -f docker/docker-compose.prod.yml logs db

# Verify connection string in .env
```

### Migration Errors

```bash
# Check migration status
npx prisma migrate status

# Reset and re-run (DESTRUCTIVE)
npx prisma migrate reset
```

### Permission Denied

Ensure the user has correct role:
- **Admin**: Full access
- **Ops**: Can manage inventory but not users
- **Viewer**: Read-only access

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│              Docker Host                     │
│  ┌─────────────────┐  ┌─────────────────┐   │
│  │   App Container │  │   DB Container  │   │
│  │   (Next.js)     │──│   (PostgreSQL)  │   │
│  │   Port 3000     │  │   Port 5432     │   │
│  └─────────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────┘
```

For HTTPS in production, place behind a reverse proxy (nginx, Caddy, Traefik).
