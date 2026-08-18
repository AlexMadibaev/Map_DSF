import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptEncoder } from 'meshoptimizer';

const inputPath = 'public/test-map.glb';
const outputPath = 'public/collision.glb';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'meshopt.encoder': MeshoptEncoder,
  });

const document = await io.read(inputPath);
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
await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
await io.write(outputPath, document);
console.log(`Collision map written to ${outputPath}`);
