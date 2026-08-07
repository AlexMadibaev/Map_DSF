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

// Индексы объектов в финальном GLB, для которых нужна физика:
// техническая зона, сцена, арка и базовая поверхность земли.
// Трибуны, сиденья, фестивальные зоны, вывески и декор исключены.
const colliderNodeIndexes = new Set([
  0, 1, 2,
  ...range(26, 33),
  49, 51, 52,
  ...range(62, 68),
  ...range(91, 94),
  95, 96, 97, 98, 99, 100,
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
