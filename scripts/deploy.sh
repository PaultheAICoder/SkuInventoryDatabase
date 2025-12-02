#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Trevor Inventory - Production Deployment${NC}"
echo "=========================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    echo ""
    echo "Please create a .env file with the following:"
    echo ""
    cat .env.example
    echo ""
    echo "Run: cp .env.example .env && nano .env"
    exit 1
fi

# Source .env to check required variables
source .env

if [ -z "$NEXTAUTH_SECRET" ] || [ "$NEXTAUTH_SECRET" = "generate-a-new-secret-here" ]; then
    echo -e "${RED}Error: NEXTAUTH_SECRET is not set or is using default value${NC}"
    echo ""
    echo "Generate a new secret with: openssl rand -base64 32"
    echo "Then add it to your .env file"
    exit 1
fi

echo -e "${GREEN}1. Building and starting containers...${NC}"
docker compose -f docker/docker-compose.prod.yml up -d --build

echo -e "${GREEN}2. Waiting for database to be ready...${NC}"
sleep 10

echo -e "${GREEN}3. Running database migrations...${NC}"
docker compose -f docker/docker-compose.prod.yml exec -T app npx prisma migrate deploy

echo -e "${GREEN}4. Seeding database (if empty)...${NC}"
docker compose -f docker/docker-compose.prod.yml exec -T app npx prisma db seed || echo -e "${YELLOW}Seed skipped (database may already have data)${NC}"

echo ""
echo -e "${GREEN}=========================================="
echo "Deployment complete!"
echo "=========================================="
echo ""
echo "The application is now running at: ${NEXTAUTH_URL:-http://localhost:3000}"
echo ""
echo "Default login credentials:"
echo "  Admin: admin@tonsil.tech / changeme123"
echo "  Ops:   ops@tonsil.tech / changeme123"
echo "  View:  viewer@tonsil.tech / changeme123"
echo ""
echo -e "To view logs: ${YELLOW}docker compose -f docker/docker-compose.prod.yml logs -f app${NC}"
echo -e "To stop:      ${YELLOW}docker compose -f docker/docker-compose.prod.yml down${NC}"
echo -e "${NC}"
