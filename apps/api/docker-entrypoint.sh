#!/bin/sh
# Applies pending migrations, then starts the API. Demo data is seeded explicitly:
#   docker compose exec api node dist/prisma/seed/demo.js
set -e
node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
exec node dist/src/main.js
