"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CompiledChapter, CompiledLandscape } from "@/domain/site-compiler";
import { box, flatPolygon, merge, paint, palmGeometry, ribbonGeometry, treeGeometry } from "./geometry";
import { useHighlight } from "./highlight";
import { siteMaterial } from "./materials";

type Ch = { chapters: CompiledChapter[] };

export function Ground() {
  const geo = useMemo(() => new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), []);
  const mat = useMemo(() => siteMaterial("ground", { roughness: 0.95 }), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  return <mesh geometry={geo} material={mat} receiveShadow />;
}

export function Road({ l, chapters }: { l: CompiledLandscape } & Ch) {
  const r = l.road;
  const geo = useMemo(() => ribbonGeometry(r.path, r.width / 2 + r.sidewalk, 0.04), [r]);
  const mat = useMemo(
    () => siteMaterial("road", { side: THREE.DoubleSide, roughness: 0.9 }, { uRoadW: { value: r.width }, uLanes: { value: r.lanes } }),
    [r],
  );
  useHighlight(r.id, chapters, [mat]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  return <mesh geometry={geo} material={mat} receiveShadow />;
}

/** Paving + hedges merged into one mesh; palms and trees instanced (1 draw call each). */
export function Planting({ l, chapters }: { l: CompiledLandscape } & Ch) {
  const ground = useMemo(() => {
    const parts: THREE.BufferGeometry[] = l.paving.map((p, i) => paint(flatPolygon(p, 0.03 + i * 0.005), i === 0 ? "#b9b6ae" : "#8b8d8f"));
    l.hedges.forEach((h, i) => {
      const dx = h.b[0] - h.a[0];
      const dz = h.b[1] - h.a[1];
      const len = Math.hypot(dx, dz);
      // split long hedges into lumpy runs so they read as clipped shrubs
      const n = Math.max(1, Math.round(len / 6));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const hh = l.hedgeHeight * (0.85 + 0.3 * Math.abs(Math.sin((i + 1) * (k + 1) * 12.9898)));
        parts.push(paint(box(len / n - 0.15, hh, l.hedgeWidth, h.a[0] + dx * t, hh / 2, h.a[1] + dz * t, Math.atan2(-dz, dx)), k % 3 === 0 ? "#2e5524" : "#355f29"));
      }
    });
    return parts.length ? merge(parts) : null;
  }, [l]);
  const kitMat = useMemo(() => siteMaterial("kit", { vertexColors: true, roughness: 0.92 }), []);
  const palmGeo = useMemo(() => palmGeometry(), []);
  const treeGeo = useMemo(() => treeGeometry(), []);
  const vegMat = useMemo(() => siteMaterial("kit", { vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), []);
  const palms = useRef<THREE.InstancedMesh>(null);
  const trees = useRef<THREE.InstancedMesh>(null);
  useHighlight(l.id, chapters, [kitMat, vegMat]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const e = new THREE.Euler();
    const q = new THREE.Quaternion();
    if (palms.current) {
      l.palms.forEach((p, i) => {
        e.set(p.lean, p.rot, p.lean * 0.5);
        q.setFromEuler(e);
        const s = p.height / 14;
        m.compose(new THREE.Vector3(p.pos[0], 0, p.pos[1]), q, new THREE.Vector3(s, s, s));
        palms.current!.setMatrixAt(i, m);
      });
      palms.current.instanceMatrix.needsUpdate = true;
      palms.current.computeBoundingSphere();
    }
    if (trees.current) {
      l.trees.forEach((t, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
        m.compose(new THREE.Vector3(t.pos[0], 0, t.pos[1]), q, new THREE.Vector3(t.scale, t.scale, t.scale));
        trees.current!.setMatrixAt(i, m);
      });
      trees.current.instanceMatrix.needsUpdate = true;
      trees.current.computeBoundingSphere();
    }
  }, [l]);

  useEffect(
    () => () => {
      ground?.dispose();
      kitMat.dispose();
      palmGeo.dispose();
      treeGeo.dispose();
      vegMat.dispose();
    },
    [ground, kitMat, palmGeo, treeGeo, vegMat],
  );

  return (
    <group>
      {ground && <mesh geometry={ground} material={kitMat} receiveShadow castShadow />}
      {l.palms.length > 0 && (
        <instancedMesh ref={palms} args={[palmGeo, vegMat, l.palms.length]} castShadow />
      )}
      {l.trees.length > 0 && <instancedMesh ref={trees} args={[treeGeo, vegMat, l.trees.length]} castShadow receiveShadow />}
    </group>
  );
}
