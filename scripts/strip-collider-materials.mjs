import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

const document = await io.read('public/map.glb');
const root = document.getRoot();

// Индексы объектов в Тест++.glb, для которых нужна физика:
// технический бокс, сцена, стадион/трибуны, земля и ворота.
// Объекты фестивальных зон, вывески и декор намеренно исключены.
const colliderNodeIndexes = new Set([
  0, 1, 2,
  ...range(19, 34),
  49, 51, 52,
  ...range(53, 68),
  70,
  ...range(81, 100),
  ...range(143, 170),
]);

root.listNodes().forEach((node, index) => {
  if (!colliderNodeIndexes.has(index)) node.dispose();
});

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

function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}
