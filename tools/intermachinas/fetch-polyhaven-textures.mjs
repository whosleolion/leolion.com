// Download 1k Diffuse / normal (GL) / roughness JPGs for Poly Haven texture ids (all CC0).
//   node fetch-polyhaven-textures.mjs <outDir> hessian_380 brown_leather green_metal_rust
import fs from 'fs';
const dir = process.argv[2];
const ids = process.argv.slice(3);
for (const id of ids) {
  const f = await (await fetch('https://api.polyhaven.com/files/' + id)).json();
  for (const m of ['Diffuse', 'nor_gl', 'Rough']) {
    const u = f[m]?.['1k']?.jpg?.url; if (!u) { console.log('missing', id, m); continue; }
    const b = Buffer.from(await (await fetch(u)).arrayBuffer());
    fs.writeFileSync(`${dir}/${id}_${m}.jpg`, b); console.log(id, m, b.length);
  }
}
