import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

const document = await io.read('Тест+.glb');
const root = document.getRoot();

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

await io.write('collision-bare.glb', document);
