import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

const sourceParts = (await readdir('public'))
  .filter((name) => /^test-map\.glb\.part\d+$/.test(name))
  .sort((a, b) => Number(a.match(/\d+$/)[0]) - Number(b.match(/\d+$/)[0]));
const source = Buffer.concat(await Promise.all(sourceParts.map((name) => readFile(`public/${name}`))));
const toolsDirectory = path.resolve('.tools');
const inputPath = path.join(toolsDirectory, 'ios-ktx2-input.glb');
const outputPath = path.join(toolsDirectory, 'ios-ktx2-output.glb');
const compressedPath = path.join(toolsDirectory, 'ios-ktx2-compressed.glb');
await mkdir(toolsDirectory, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const document = await io.readBinary(source);
for (const material of document.getRoot().listMaterials()) {
  if (!/fridge_c/i.test(material.getName())) continue;
  material.setBaseColorTexture(null);
  material.setNormalTexture(null);
  material.setEmissiveTexture(null);
  material.setMetallicRoughnessTexture(null);
  material.setOcclusionTexture(null);
}
for (const texture of document.getRoot().listTextures()) {
  const image = sharp(texture.getImage());
  const metadata = await image.metadata();
  const width = Math.ceil(metadata.width / 4) * 4;
  const height = Math.ceil(metadata.height / 4) * 4;
  if (width !== metadata.width || height !== metadata.height) image.resize(width, height, { fit: 'fill' });
  const png = await image.png().toBuffer();
  texture.setImage(png).setMimeType('image/png');
}
await io.write(inputPath, document);

const cliPath = path.resolve('node_modules/.bin/gltf-transform.cmd');
const ktxBin = path.resolve('.tools/ktx/bin');
const runCli = (args) => new Promise((resolve, reject) => {
  const process = spawn(cliPath, args, {
    stdio: 'inherit',
    shell: true,
    env: { ...globalThis.process.env, PATH: `${ktxBin};${globalThis.process.env.PATH}` },
  });
  process.on('error', reject);
  process.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`glTF transform failed (${code})`))));
});
await runCli([
    'uastc', inputPath, outputPath,
    '--level', '2',
    '--rdo',
    '--rdo-lambda', '0.5',
    '--zstd', '10',
    '--mipmaps', 'true',
    '--jobs', '8',
]);
await runCli(['meshopt', outputPath, compressedPath, '--level', 'high']);

const output = await readFile(compressedPath);
const chunkSize = 2 * 1024 * 1024;
for (const name of await readdir('public')) {
  if (/^test-map-ios-ktx2\.glb\.part\d+$/.test(name)) await rm(`public/${name}`, { force: true });
}
for (let offset = 0, part = 1; offset < output.length; offset += chunkSize, part += 1) {
  await writeFile(`public/test-map-ios-ktx2.glb.part${part}`, output.subarray(offset, offset + chunkSize));
}
await rm(inputPath, { force: true });
await rm(outputPath, { force: true });
await rm(compressedPath, { force: true });
console.log(`iOS KTX2 map: ${output.length} bytes, ${Math.ceil(output.length / chunkSize)} parts.`);
