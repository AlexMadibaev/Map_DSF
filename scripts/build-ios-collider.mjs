import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });

await MeshoptDecoder.ready;
const document = await io.read('public/collision.glb');
const root = document.getRoot();
let keptTriangles = 0;

for (const mesh of root.listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    const position = primitive.getAttribute('POSITION');
    const indices = primitive.getIndices();
    if (!position) continue;
    const kept = [];
    const triangleCount = (indices ? indices.getCount() : position.getCount()) / 3;
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const a = indices ? indices.getScalar(triangle * 3) : triangle * 3;
      const b = indices ? indices.getScalar(triangle * 3 + 1) : triangle * 3 + 1;
      const c = indices ? indices.getScalar(triangle * 3 + 2) : triangle * 3 + 2;
      const pa = position.getElement(a, []);
      const pb = position.getElement(b, []);
      const pc = position.getElement(c, []);
      const ax = pa[0]; const ay = pa[1]; const az = pa[2];
      const abx = pb[0] - ax; const aby = pb[1] - ay; const abz = pb[2] - az;
      const acx = pc[0] - ax; const acy = pc[1] - ay; const acz = pc[2] - az;
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      const length = Math.hypot(nx, ny, nz) || 1;
      if (Math.abs(nz / length) >= 0.45) kept.push(a, b, c);
    }
    keptTriangles += kept.length / 3;
    const IndexArray = position.getCount() <= 65535 ? Uint16Array : Uint32Array;
    const accessor = document.createAccessor('iOS walkable indices')
      .setType('SCALAR')
      .setBuffer(position.getBuffer())
      .setArray(new IndexArray(kept));
    primitive.setIndices(accessor);
  }
}

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
await document.transform(
  prune(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.25, error: 0.003, lockBorder: true }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);
await io.write('public/collision-ios.glb', document);
console.log(`iOS collider written with ${keptTriangles} walkable triangles.`);
