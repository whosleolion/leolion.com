// Sky dome, sun/hemisphere light, fog and the three times of day.
import { THREE } from './util.js';

const C = h => new THREE.Color(h);
export const TOD = {
  golden: { az: 252, el: 13, sun: C(0xffb574), sunI: 2.9, top: C(0x3f6db8), hor: C(0xffc995), hemiS: C(0xb4c6f0), hemiG: C(0x9a8268), hemiI: 1.9, fog: C(0xf0c9a2), fogFar: 470, exp: 1.02, night: 0 },
  day:    { az: 205, el: 54, sun: C(0xfff4e2), sunI: 3.0, top: C(0x2f6fd0), hor: C(0xc5ddf2), hemiS: C(0xc4dcff), hemiG: C(0x9a948a), hemiI: 1.7, fog: C(0xc9dcec), fogFar: 540, exp: .95, night: 0 },
  night:  { az: 140, el: 48, sun: C(0x8fa6ff), sunI: .5, top: C(0x040711), hor: C(0x2a2030), hemiS: C(0x6f7cb4), hemiG: C(0x8a6a48), hemiI: 1.05, fog: C(0x1c1924), fogFar: 400, exp: 1.25, night: 1 },
};
export const TOD_ORDER = ['golden', 'night', 'day'];

export function buildSky(scene, renderer, mobile) {
  const sun = new THREE.DirectionalLight(0xffffff, 3); sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1536 : 2048, mobile ? 1536 : 2048);
  sun.shadow.bias = -.0005; sun.shadow.normalBias = .14;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1); scene.add(hemi);
  scene.fog = new THREE.Fog(0xffffff, 40, 600);

  const u = { top: { value: C(0) }, hor: { value: C(0) }, sunCol: { value: C(0) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, night: { value: 0 }, time: { value: 0 }, fogCol: { value: C(0) } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 top, hor, sunCol, sunDir, fogCol; uniform float night, time;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.03+7.1; a*=.5; } return s; }
      void main(){
        vec3 d = normalize(vDir); float h = max(d.y, 0.);
        vec3 c = mix(hor, top, pow(h, .5));
        float sd = max(dot(d, sunDir), 0.);
        c += sunCol * (pow(sd, 600.) * 6. + pow(sd, 12.) * .28 + pow(sd, 3.) * .1) * (1. - night * .7);
        vec2 uv = d.xz / (d.y + .16) * 1.1 + time * .006;
        float cl = smoothstep(.48, .82, fbm(uv)) * smoothstep(.0, .22, d.y);
        vec3 cc = mix(hor * 1.05 + sunCol * .3 * pow(sd, 2.), vec3(1.), .4 * (1. - night));
        c = mix(c, cc * (1. - .82 * night), cl * .8);
        vec2 g = floor(d.xz / (abs(d.y) + .35) * 190.);
        c += step(.9972, hash(g)) * night * h * (1. - cl) * vec3(.9, .95, 1.);
        c = mix(fogCol, c, smoothstep(-.01, .09, d.y));
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  dome.frustumCulled = false; dome.renderOrder = -10; scene.add(dome);

  const cur = { az: 0, el: 0, sun: C(0), sunI: 0, top: C(0), hor: C(0), hemiS: C(0), hemiG: C(0), hemiI: 0, fog: C(0), fogFar: 0, exp: 1, night: 0 };
  let target = TOD.golden, name = 'golden';
  const copy = t => { for (const k in cur) { if (cur[k].isColor) cur[k].copy(t[k]); else cur[k] = t[k]; } };
  copy(target);
  const dir = new THREE.Vector3();
  function update(dt, time, focus, range) {
    const k = 1 - Math.exp(-dt * 1.8);
    for (const key in cur) { if (cur[key].isColor) cur[key].lerp(target[key], k); else cur[key] += (target[key] - cur[key]) * k; }
    const az = cur.az * Math.PI / 180, el = cur.el * Math.PI / 180;
    dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    sun.color.copy(cur.sun); sun.intensity = cur.sunI;
    hemi.color.copy(cur.hemiS); hemi.groundColor.copy(cur.hemiG); hemi.intensity = cur.hemiI;
    scene.fog.color.copy(cur.fog); scene.fog.far = cur.fogFar; scene.fog.near = cur.fogFar * .06;
    renderer.toneMappingExposure = cur.exp;
    u.top.value.copy(cur.top); u.hor.value.copy(cur.hor); u.sunCol.value.copy(cur.sun); u.sunDir.value.copy(dir); u.night.value = cur.night; u.fogCol.value.copy(cur.fog); u.time.value = time;
    // shadow box follows the viewer, snapped to texels so edges don't crawl
    const sc = sun.shadow.camera, tex = range * 2 / sun.shadow.mapSize.x;
    if (sc.right !== range) { sc.left = -range; sc.right = range; sc.top = range; sc.bottom = -range; sc.near = 10; sc.far = 1200; sc.updateProjectionMatrix(); }
    const fx = Math.round(focus.x / tex) * tex, fz = Math.round(focus.z / tex) * tex;
    sun.target.position.set(fx, 0, fz); sun.position.set(fx + dir.x * 500, dir.y * 500, fz + dir.z * 500);
    dome.position.set(focus.x, 0, focus.z);
    return cur.night;
  }
  return { update, set(n, instant) { name = n; target = TOD[n]; if (instant) copy(target); }, get name() { return name; }, sun };
}
