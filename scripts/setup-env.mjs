import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../nestjs-project/.env', import.meta.url));
if (existsSync(target)) {
  console.log('Arquivo .env existente preservado.');
  process.exit(0);
}
const secret = () => randomBytes(32).toString('hex');
writeFileSync(target, `NODE_ENV=development
PORT=3000
DB_HOST=db
DB_PORT=5432
DB_USERNAME=streamtube
DB_PASSWORD=${secret()}
DB_NAME=streamtube
JWT_SECRET=${secret()}
JWT_REFRESH_SECRET=${secret()}
APP_URL=http://localhost:3000
MAIL_HOST=mailpit
MAIL_PORT=1025
MAIL_FROM=noreply@streamtube.local
SWAGGER_ENABLED=true
REDIS_HOST=redis
REDIS_PORT=6379
STORAGE_ENDPOINT=http://minio:9000
STORAGE_PUBLIC_ENDPOINT=http://localhost:9000
STORAGE_REGION=us-east-1
STORAGE_BUCKET=streamtube
STORAGE_ACCESS_KEY=streamtube-local
STORAGE_SECRET_KEY=${secret()}
VIDEO_PROCESS_TIMEOUT_MS=1800000
`, { mode: 0o600, flag: 'wx' });
console.log('Ambiente local gerado com segredos aleatórios; valores não exibidos.');
