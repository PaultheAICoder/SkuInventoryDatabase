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

# Validate NEXTAUTH_SECRET
if [ -z "$NEXTAUTH_SECRET" ] || [ "$NEXTAUTH_SECRET" = "generate-a-new-secret-here" ]; then
    echo -e "${RED}Error: NEXTAUTH_SECRET is not set or is using default value${NC}"
    echo ""
    echo "Generate a new secret with: openssl rand -base64 32"
    echo "Then add it to your .env file"
    exit 1
fi

# Validate POSTGRES_PASSWORD
if [ -z "$POSTGRES_PASSWORD" ] || [ "$POSTGRES_PASSWORD" = "change-this-to-a-secure-password" ]; then
    echo -e "${RED}Error: POSTGRES_PASSWORD is not set or is using default value${NC}"
    echo ""
    echo "Please set a secure password in your .env file"
    exit 1
fi

# Create backup directory if it doesn't exist
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

# Ensure SSL certificates exist for nginx
SSL_DIR="./docker/nginx/ssl"
if [ ! -f "$SSL_DIR/cert.pem" ] || [ ! -f "$SSL_DIR/key.pem" ]; then
    echo -e "${GREEN}1. Generating SSL certificates...${NC}"
    ./scripts/generate-ssl.sh
else
    echo -e "${GREEN}1. SSL certificates already exist${NC}"
fi

# Check if database container is running and backup if it exists
if docker ps --format '{{.Names}}' | grep -q "inventory-db-prod"; then
    echo -e "${GREEN}2. Backing up existing database...${NC}"
    BACKUP_FILE="$BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql"
    docker exec inventory-db-prod pg_dump -U postgres inventory > "$BACKUP_FILE" 2>/dev/null || echo -e "${YELLOW}No existing database to backup (first deployment)${NC}"
    if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
        echo -e "${GREEN}   Backup saved to: $BACKUP_FILE${NC}"
    fi
else
    echo -e "${YELLOW}2. No existing database container found (first deployment)${NC}"
fi

echo -e "${GREEN}3. Building and starting containers...${NC}"
docker compose -f docker/docker-compose.prod.yml up -d --build

echo -e "${GREEN}4. Waiting for database to be healthy...${NC}"
# Wait for the database container health check to pass
until docker inspect --format='{{.State.Health.Status}}' inventory-db-prod 2>/dev/null | grep -q "healthy"; do
    echo -n "."
    sleep 1
done
echo " Ready!"

echo -e "${GREEN}5. Running database migrations...${NC}"
DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@localhost:4546/inventory?schema=public" npx prisma migrate deploy

echo -e "${GREEN}6. Seeding database (if empty)...${NC}"
DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@localhost:4546/inventory?schema=public" npx prisma db seed || echo -e "${YELLOW}Seed skipped (database may already have data)${NC}"

echo ""
echo -e "${GREEN}=========================================="
echo "Deployment complete!"
echo "=========================================="
echo ""
echo "The application is now running at: ${NEXTAUTH_URL}"
echo ""
echo -e "${YELLOW}Note: Using self-signed SSL certificate - browser will show a warning.${NC}"
echo ""
echo "Default login credentials:"
echo "  Admin: admin@tonsil.tech / changeme123"
echo "  Ops:   ops@tonsil.tech / changeme123"
echo "  View:  viewer@tonsil.tech / changeme123"
echo ""
echo -e "To view logs: ${YELLOW}docker compose -f docker/docker-compose.prod.yml logs -f${NC}"
echo -e "To stop:      ${YELLOW}docker compose -f docker/docker-compose.prod.yml down${NC}"
echo -e "${NC}"
