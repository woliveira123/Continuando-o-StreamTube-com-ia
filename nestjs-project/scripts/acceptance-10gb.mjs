import { request as httpRequest } from 'node:http';
import { randomUUID, createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { S3Client, AbortMultipartUploadCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

// Explicit, resource-intensive acceptance test; never runs as part of the normal suite.
if (process.env.RUN_LARGE_UPLOAD !== 'true') throw new Error('Set RUN_LARGE_UPLOAD=true to transfer 10 GB.');
const db = new pg.Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
const storage = new S3Client({ endpoint: process.env.STORAGE_ENDPOINT, region: process.env.STORAGE_REGION, forcePathStyle: true, credentials: { accessKeyId: process.env.STORAGE_ACCESS_KEY, secretAccessKey: process.env.STORAGE_SECRET_KEY } });
const userId = randomUUID(), channelId = randomUUID();
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const payload = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, email: `${userId}@example.test`, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
const token = `${payload}.${createHmac('sha256', process.env.JWT_SECRET).update(payload).digest('base64url')}`;
const api = process.env.ACCEPTANCE_API || 'http://nestjs-api:3000';
let video;
let timer;
let pending;
const latencies = [];
let heartbeatFailures = 0;
async function request(path, method = 'GET', body) {
  for (;;) {
    const response = await fetch(`${api}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.status === 429) { await delay(Number(response.headers.get('retry-after') || 60) * 1000); continue; }
    if (!response.ok) throw new Error(`API HTTP ${response.status} on ${path}`);
    return response.json();
  }
}
const directory = await mkdtemp(join(tmpdir(), 'streamtube-10gb-'));
try {
  await db.connect();
  await db.query('INSERT INTO users (id,email,password,is_confirmed) VALUES ($1,$2,$3,true)', [userId, `${userId}@example.test`, 'acceptance-not-a-login-password']);
  await db.query('INSERT INTO channels (id,user_id,name,nickname) VALUES ($1,$2,$3,$4)', [channelId, userId, 'Acceptance 10 GB', channelId]);
  const source = join(directory, 'sample.mp4');
  execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i','color=c=blue:s=160x120:r=10','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',source]);
  const fixture = await readFile(source);
  video = await request('/videos', 'POST', { title: '10 GB acceptance', filename: 'acceptance.mp4', size: 10_000_000_000 });
  timer = setInterval(() => {
    if (pending) return;
    const start = performance.now();
    pending = request(`/videos/${video.id}`).then(() => latencies.push(performance.now() - start)).catch(() => heartbeatFailures++).finally(() => { pending = undefined; });
  }, 5000);
  const start = performance.now();
  let sent = 0;
  for (let part = 1; part <= video.part_count; part++) {
    const signed = await request(`/videos/${video.id}/parts/${part}`, 'POST');
    const buffer = Buffer.alloc(signed.size);
    if (part === 1) fixture.copy(buffer);
    // Container-only route: preserve the signed Host while reaching MinIO internally.
    const url = new URL(signed.url);
    const signedHost = url.host;
    const internal = new URL(process.env.STORAGE_ENDPOINT);
    url.host = internal.host;
    url.protocol = internal.protocol;
    const status = await new Promise((resolve, reject) => {
      const upload = httpRequest(url, { method: 'PUT', headers: { Host: signedHost, 'Content-Length': String(buffer.length) } }, response => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      });
      upload.on('error', reject);
      upload.end(buffer);
    });
    if (status !== 200) throw new Error(`Storage part ${part}: HTTP ${status}`);
    sent += buffer.length;
    if (part % 50 === 0 || part === video.part_count) console.log(`Transferred ${sent} bytes (${part}/${video.part_count})`);
  }
  const uploadSeconds = (performance.now() - start) / 1000;
  video = await request(`/videos/${video.id}/complete`, 'POST');
  const deadline = Date.now() + 600000;
  while (video.status === 'processing' && Date.now() < deadline) {
    await delay(5000);
    video = await request(`/videos/${video.id}`);
  }
  if (video.status !== 'ready' || video.metadata?.size !== 10_000_000_000 || heartbeatFailures) throw new Error(`Acceptance failed: status=${video.status}, heartbeatFailures=${heartbeatFailures}`);
  console.log(JSON.stringify({ bytes: sent, parts: video.part_count, status: video.status, metadata: video.metadata, upload_seconds: Math.round(uploadSeconds), total_seconds: Math.round((performance.now()-start)/1000), api_samples: latencies.length, api_max_ms: Math.round(Math.max(...latencies)), heartbeat_failures: heartbeatFailures, client_rss_bytes: process.memoryUsage().rss }, null, 2));
} finally {
  clearInterval(timer);
  await pending;
  if (video) {
    const row = (await db.query('SELECT original_key,upload_id FROM videos WHERE id=$1', [video.id])).rows[0];
    if (row?.upload_id) await storage.send(new AbortMultipartUploadCommand({ Bucket: process.env.STORAGE_BUCKET, Key: row.original_key, UploadId: row.upload_id })).catch(() => undefined);
  }
  const objects = await storage.send(new ListObjectsV2Command({ Bucket: process.env.STORAGE_BUCKET, Prefix: `channels/${channelId}/` }));
  if (objects.Contents?.length) await storage.send(new DeleteObjectsCommand({ Bucket: process.env.STORAGE_BUCKET, Delete: { Objects: objects.Contents.map(({Key}) => ({Key})) } }));
  await db.query('DELETE FROM channels WHERE id=$1', [channelId]);
  await db.query('DELETE FROM users WHERE id=$1', [userId]);
  await db.end();
  storage.destroy();
  await rm(directory, { recursive: true, force: true });
}
