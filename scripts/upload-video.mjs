import { open, stat, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const file = process.argv[2];
const token = process.env.STREAMTUBE_TOKEN;
const api = process.env.STREAMTUBE_API ?? 'http://localhost:3000';
if (!file || !token) throw new Error('Use: STREAMTUBE_TOKEN=<token> node scripts/upload-video.mjs <file> [title]. Set the token in the environment, never in a committed file.');
const path = resolve(file);
const info = await stat(path);
const statePath = `${path}.streamtube-upload.json`;
if (!info.isFile() || info.size < 1 || info.size > 10_000_000_000) throw new Error('File must contain 1 to 10,000,000,000 bytes.');
async function request(route, method = 'GET', body) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`${api}${route}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.status === 429) { await delay(Number(response.headers.get('retry-after') || 60) * 1000); continue; }
    if (!response.ok) throw new Error(`API ${method} ${route}: HTTP ${response.status}`);
    return response.json();
  }
  throw new Error('Rate limit persists. Resume later with the same file.');
}
let state;
try { state = JSON.parse(await readFile(statePath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (state && (state.api !== api || state.size !== info.size || state.modified !== info.mtimeMs)) throw new Error('Local file or API changed. Use the original file to resume.');
let video = state ? await request(`/videos/${state.id}`) : await request('/videos', 'POST', { title: process.argv[3] || basename(path), filename: basename(path), size: info.size });
if (!state) await writeFile(statePath, JSON.stringify({ id: video.id, api, size: info.size, modified: info.mtimeMs }), { mode: 0o600, flag: 'wx' });
console.log(`Video: ${video.id}; status: ${video.status}`);
if (video.status === 'draft') {
  const uploaded = await request(`/videos/${video.id}/upload`);
  const done = new Set(uploaded.parts.map(part => part.part_number));
  const handle = await open(path, 'r');
  try {
    for (let part = 1; part <= video.part_count; part++) {
      if (done.has(part)) continue;
      const offset = (part - 1) * video.part_size;
      const buffer = Buffer.alloc(Math.min(video.part_size, info.size - offset));
      let bytes = 0;
      while (bytes < buffer.length) {
        const result = await handle.read(buffer, bytes, buffer.length - bytes, offset + bytes);
        if (!result.bytesRead) throw new Error('File changed during upload.');
        bytes += result.bytesRead;
      }
      let success = false;
      for (let retry = 0; retry < 3 && !success; retry++) {
        const signed = await request(`/videos/${video.id}/parts/${part}`, 'POST');
        try {
          const result = await fetch(signed.url, { method: 'PUT', headers: { 'Content-Length': String(buffer.length) }, body: buffer });
          success = result.ok;
        } catch { /* Retry only this part, requesting a fresh URL. */ }
        if (!success) await delay(1000 * (retry + 1));
      }
      if (!success) throw new Error(`Part ${part} failed. Run the same command to resume.`);
      console.log(`Uploaded part ${part}/${video.part_count}`);
    }
  } finally { await handle.close(); }
  video = await request(`/videos/${video.id}/complete`, 'POST');
}
while (video.status === 'processing') {
  await delay(5000);
  video = await request(`/videos/${video.id}`);
}
console.log(JSON.stringify(video, null, 2));
if (video.status !== 'ready') process.exitCode = 1;
