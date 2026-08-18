import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { join, meshopt, simplify, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { readFile, readdir } from 'node:fs/promises';

const outputPath = 'public/collision.glb';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'meshopt.encoder': MeshoptEncoder,
  });

const mapPartNames = (await readdir('public'))
  .filter((name) => /^test-map\.glb\.part\d+$/.test(name))
  .sort((a, b) => Number(a.match(/\d+$/)[0]) - Number(b.match(/\d+$/)[0]));
if (!mapPartNames.length) throw new Error('No test-map.glb.part* files found.');
const mapParts = await Promise.all(mapPartNames.map((name) => readFile(`public/${name}`)));
const document = await io.readBinary(Buffer.concat(mapParts));
const root = document.getRoot();

// The optimized visual map is merged into one mesh, so node-name filtering is
// no longer reliable. Keep every triangle, but strip render-only data.
for (const mesh of root.listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    primitive.setMaterial(null);
    for (const semantic of primitive.listSemantics()) {
      if (semantic !== 'POSITION') primitive.setAttribute(semantic, null);
    }
  }
}

for (const material of root.listMaterials()) material.dispose();
for (const texture of root.listTextures()) texture.dispose();

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
await document.transform(
  join({ keepMeshes: true }),
  weld(),
  simplify({
    simplifier: MeshoptSimplifier,
    ratio: 0.05,
    error: 0.002,
    lockBorder: false,
  }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);
await io.write(outputPath, document);
console.log(`Collision map written to ${outputPath}`);
