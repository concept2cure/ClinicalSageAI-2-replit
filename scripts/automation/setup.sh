#!/usr/bin/env bash
set -e
cp env.sample .env
read -rp "FQDN for SaaS (e.g., trialsage.acme.com): " DOMAIN
sed -i "s/{{DOMAIN}}/$DOMAIN/g" docker-compose.yml
sed -i "s/^BASE_URL=.*/BASE_URL=https:\/\/$DOMAIN/" .env
read -rp "Email for Let's Encrypt notifications: " EMAIL
sed -i "s/admin@example.com/$EMAIL/g" docker-compose.yml
mkdir -p letsencrypt
docker-compose pull
docker-compose build
printf '\nRun: docker-compose up -d\n'
