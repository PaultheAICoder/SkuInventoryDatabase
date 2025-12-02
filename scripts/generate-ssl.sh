#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SSL_DIR="./docker/nginx/ssl"

# Create SSL directory if it doesn't exist
mkdir -p "$SSL_DIR"

# Check if certificates already exist
if [ -f "$SSL_DIR/cert.pem" ] && [ -f "$SSL_DIR/key.pem" ]; then
    echo -e "${YELLOW}SSL certificates already exist in $SSL_DIR${NC}"
    echo "To regenerate, delete the existing files first:"
    echo "  rm $SSL_DIR/cert.pem $SSL_DIR/key.pem"
    exit 0
fi

echo -e "${GREEN}Generating self-signed SSL certificate...${NC}"

# Generate self-signed certificate valid for 365 days
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$SSL_DIR/key.pem" \
    -out "$SSL_DIR/cert.pem" \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

echo -e "${GREEN}SSL certificates generated successfully!${NC}"
echo "  Certificate: $SSL_DIR/cert.pem"
echo "  Private Key: $SSL_DIR/key.pem"
echo ""
echo -e "${YELLOW}Note: These are self-signed certificates for development/internal use.${NC}"
echo "For production with a public domain, use Let's Encrypt or a commercial CA."
