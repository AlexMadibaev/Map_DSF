import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, simplify, textureCompress, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { readFile, readdir, writeFile } from 'node:fs/promises';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'meshopt.encoder': MeshoptEncoder,
  });

const names = (await readdir('public'))
  .filter((name) => /^test-map\.glb\.part\d+$/.test(name))
  .sort((a, b) => Number(a.match(/\d+$/)[0]) - Number(b.match(/\d+$/)[0]));
const parts = await Promise.all(names.map((name) => readFile(`public/${name}`)));
const document = await io.readBinary(Buffer.concat(parts));

for (const material of document.getRoot().listMaterials()) {
  material.setNormalTexture(null);
  material.setOcclusionTexture(null);
  material.setMetallicRoughnessTexture(null);
  material.setMetallicFactor(0);
  material.setRoughnessFactor(0.8);
}
for (const mesh of document.getRoot().listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    primitive.setAttribute('COLOR_1', null);
    primitive.setAttribute('TEXCOORD_1', null);
    primitive.setAttribute('TANGENT', null);
  }
}

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
await document.transform(
  textureCompress({ targetFormat: 'webp', resize: [512, 512] }),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.2, error: 0.003, lockBorder: false }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);

const output = await io.writeBinary(document);
const chunkSize = 2 * 1024 * 1024;
for (let offset = 0, part = 1; offset < output.length; offset += chunkSize, part += 1) {
  await writeFile(`public/test-map-ios.glb.part${part}`, output.subarray(offset, offset + chunkSize));
}
console.log(`iOS map: ${output.length} bytes, ${Math.ceil(output.length / chunkSize)} parts.`);
