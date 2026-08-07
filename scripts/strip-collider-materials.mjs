import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { readFile } from 'node:fs/promises';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

const mapParts = await Promise.all([1, 2, 3].map((part) => readFile(`public/map.glb.part${part}`)));
const document = await io.readBinary(Buffer.concat(mapParts));
const root = document.getRoot();

// Названия объектов в финальном GLB, для которых нужна физика:
// техническая зона, сцена, арка и базовая поверхность земли.
// Трибуны, сиденья, фестивальные зоны, вывески и декор исключены.
const colliderNodeNames = new Set([
  // Техническая зона.
  'Куб.070', 'Куб.072', 'Плоскость.020',
  'leather_part', 'Monitor', 'Cylinder.338', 'laptop14_screen.001',
  // Сцена.
  'Куб.022', 'Куб.023', 'Куб',
  'BL|H40 Rectangular Section_ 2m (H40V-L200).022',
  'BL|H40 Rectangular Section_ 2m (H40V-L200).007',
  'BL|H40 Rectangular Section_ 2m (H40V-L200).006',
  'BL|H40 Rectangular Section_ 2m (H40V-L200).005',
  'BL|H40 Rectangular Section_ 2m (H40V-L200).004',
  'BL|Static_40.006', 'Куб.037', 'Куб.039', 'Куб.052',
  'Куб.060', 'Куб.061', 'Куб.062', 'Куб.063', 'Куб.064', 'Куб.069',
  // Арка.
  'Куб.056', 'Куб.057', 'Куб.058', 'Куб.059',
  // Пол и рельеф.
  'Плоскость', 'Плоскость.002',
]);

root.listNodes().forEach((node) => {
  if (!colliderNodeNames.has(node.getName())) node.dispose();
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
