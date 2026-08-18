import { mkdir, readFile, writeFile } from 'node:fs/promises';

const input = new URL('../public/test-map.glb', import.meta.url);
const outputDirectory = new URL('../public/', import.meta.url);
const chunkSize = 2 * 1024 * 1024;
const data = await readFile(input);

await mkdir(outputDirectory, { recursive: true });

for (let offset = 0, part = 1; offset < data.length; offset += chunkSize, part += 1) {
  await writeFile(new URL(`test-map.glb.part${part}`, outputDirectory), data.subarray(offset, offset + chunkSize));
}

console.log(`Split ${(data.length / 1024 / 1024).toFixed(2)} MiB into ${Math.ceil(data.length / chunkSize)} parts.`);
