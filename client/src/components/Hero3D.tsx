import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Landing-page 3D scene: a rippling field of gold particles (the "evidence landscape") with a glowing
// runway ribbon that draws across it, dips, and holds. Gentle mouse parallax. Pauses off-screen and
// renders a single still frame under prefers-reduced-motion.

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default function Hero3D({ dark }: { dark: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current!;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return; // no WebGL: the CSS background behind still looks fine
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const fogColor = dark ? 0x0b1a18 : 0xf6f1e7;
    scene.fog = new THREE.Fog(fogColor, 14, 46);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(0, 6.2, 17);
    camera.lookAt(0, 0, -4);

    // ---- particle field
    const COLS = 150;
    const ROWS = 70;
    const W = 52;
    const D = 30;
    const count = COLS * ROWS;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const gold = new THREE.Color(dark ? '#e0b24f' : '#a8741a');
    const teal = new THREE.Color(dark ? '#4fc9a0' : '#137a5a');
    const deep = new THREE.Color(dark ? '#28484a' : '#c9bda4');
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        pos[i * 3] = (c / (COLS - 1) - 0.5) * W;
        pos[i * 3 + 2] = -(r / (ROWS - 1)) * D + 6;
        const mix = c / COLS;
        const k = new THREE.Color().lerpColors(deep, mix > 0.55 ? gold : teal, 0.5 + 0.5 * Math.min(1, Math.abs(mix - 0.55) * 2.2));
        col[i * 3] = k.r;
        col[i * 3 + 1] = k.g;
        col[i * 3 + 2] = k.b;
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.19, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: dark ? 0.95 : 0.8 });
    const field = new THREE.Points(geo, mat);
    scene.add(field);

    // ---- the runway ribbon: rises, dips, recovers, holds
    const pts = [-22, -16, -10, -5, 0, 5, 10, 16, 22].map((x, i) => new THREE.Vector3(x, [-2.0, -1.5, -0.9, -1.2, -1.1, -0.2, 0.4, 0.8, 1.0][i], 1 - i * 0.6));
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeo = new THREE.TubeGeometry(curve, 400, 0.07, 10, false);
    const tubeMat = new THREE.MeshBasicMaterial({ color: dark ? 0xf3c968 : 0xa8741a, transparent: true, opacity: 0.95 });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    const glowMat = new THREE.MeshBasicMaterial({ color: dark ? 0xe0b24f : 0xd9a441, transparent: true, opacity: dark ? 0.16 : 0.12, blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, 400, 0.32, 12, false), glowMat);
    scene.add(tube, glow);
    const totalIdx = tubeGeo.index!.count;
    // head of the line: a bright point travelling the ribbon
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 24), new THREE.MeshBasicMaterial({ color: dark ? 0xfff1c9 : 0x8a5d10 }));
    scene.add(head);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: dark ? 0xe0b24f : 0xd9a441, transparent: true, opacity: 0.8, depthWrite: false, blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending }));
    halo.scale.set(2.2, 2.2, 1);
    scene.add(halo);

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.position.z = w < 700 ? 23 : 17;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => {
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove);

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);

    const clock = new THREE.Clock();
    let raf = 0;
    const frame = () => {
      const t = reduce ? 4 : clock.getElapsedTime();
      const p = geo.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        const x = p[i * 3];
        const z = p[i * 3 + 2];
        p[i * 3 + 1] = Math.sin(x * 0.22 + t * 0.6) * 0.55 + Math.cos(z * 0.3 - t * 0.45) * 0.45 + Math.sin((x + z) * 0.12 + t * 0.3) * 0.35 - 1.6;
      }
      geo.attributes.position.needsUpdate = true;
      // ribbon draws in over 3.2 s, then holds; the head keeps gliding gently along the last stretch
      const prog = reduce ? 1 : Math.min(1, t / 3.2);
      const drawn = Math.floor((totalIdx * prog) / 3) * 3;
      tubeGeo.setDrawRange(0, drawn);
      glow.geometry.setDrawRange(0, Math.floor(((glow.geometry.index!.count * prog) / 3)) * 3);
      const u = prog < 1 ? prog : 0.985 + Math.sin(t * 1.2) * 0.012;
      const hp = curve.getPointAt(Math.min(1, u));
      head.position.copy(hp);
      halo.position.copy(hp);
      halo.material.opacity = 0.55 + Math.sin(t * 2.4) * 0.25;
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      scene.rotation.y = mouse.x * 0.12 + Math.sin(t * 0.08) * 0.05;
      camera.position.y = 6.2 - mouse.y * 0.9;
      camera.lookAt(0, 0.3, -4);
      renderer.render(scene, camera);
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (visible) frame();
    };
    if (reduce) frame();
    else loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
      geo.dispose();
      mat.dispose();
      tubeGeo.dispose();
      glow.geometry.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [dark]);
  return <div ref={host} className="absolute inset-0 [&>canvas]:w-full [&>canvas]:h-full" aria-hidden />;
}
