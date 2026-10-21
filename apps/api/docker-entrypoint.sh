#!/bin/sh
# Applies pending migrations, optionally seeds the synthetic demo organization, then starts the API.
#   DEMO_SEED_ON_START=if-missing  seed only when the demo org does not exist (Render default, ADR-022)
#   DEMO_SEED_ON_START=reset       recreate the demo org on every start (set temporarily, then switch back)
#   unset / off                    never seed; seed explicitly: docker compose exec api node dist/prisma/seed/demo.js
set -e
node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma

case "${DEMO_SEED_ON_START:-off}" in
  if-missing) node dist/prisma/seed/demo.js --if-missing || echo "WARN: demo seed failed (is DEMO_SEED_PASSWORD set, >= 10 chars?) — starting without it" >&2 ;;
  reset) node dist/prisma/seed/demo.js || echo "WARN: demo seed failed (is DEMO_SEED_PASSWORD set, >= 10 chars?) — starting without it" >&2 ;;
  off) ;;
  *) echo "WARN: unknown DEMO_SEED_ON_START='${DEMO_SEED_ON_START}', expected if-missing|reset|off — not seeding" >&2 ;;
esac

exec node dist/src/main.js
