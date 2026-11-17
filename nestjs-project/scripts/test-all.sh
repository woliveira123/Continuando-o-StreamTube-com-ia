#!/bin/sh
set -eu
if [ "${DB_NAME:-}" != "streamtube_test" ] || [ "${DB_DATABASE:-}" != "streamtube_test" ]; then
  echo 'Refusing to run destructive tests outside streamtube_test' >&2
  exit 1
fi
npm run migration:run
npm test -- --runInBand
# Legacy migration tests may recreate their schema; restore every migration before e2e.
npm run migration:run
npm run test:e2e -- --runInBand
npx tsc --noEmit
npx eslint "{src,apps,libs,test}/**/*.ts"
npm run build
