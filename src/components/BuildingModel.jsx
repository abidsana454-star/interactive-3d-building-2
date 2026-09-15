import { useRef, useEffect, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const HIGHLIGHT_COLOR = new THREE.Color(0x4da3ff);

export default function BuildingModel({ autoRotate, onHover, onSectionClick }) {
  const { scene } = useGLTF('/models/building.glb');
  const ref = useRef();
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls);

  // Precomputed once on load: list of every mesh with its zone key,
  // and the current zone that's highlighted (so we only touch
  // materials when the zone actually changes, not every frame).
  const meshZonesRef = useRef([]);
  const currentZoneRef = useRef(null);
  const boundsRef = useRef(null);

  const getZone = (x, y, z) => {
    const b = boundsRef.current;
    if (!b) return null;

    // Right side wing: anything past 65% of the building's width on X
    if (x > b.minX + b.width * 0.65) {
      return 'RIGHT';
    }

    // Otherwise classify by floor height
    const relY = (y - b.minY) / b.height;
    if (relY < 0.34) return 'GROUND';
    if (relY < 0.67) return 'FIRST';
    return 'SECOND';
  };

  useEffect(() => {
    if (!ref.current) return;
    const box = new THREE.Box3().setFromObject(ref.current);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Recenter model at origin, sitting on the ground plane
    ref.current.position.x -= center.x;
    ref.current.position.y -= box.min.y;
    ref.current.position.z -= center.z;

    // Recompute box AFTER moving, so bounds match final positions
    const box2 = new THREE.Box3().setFromObject(ref.current);
    boundsRef.current = {
      minX: box2.min.x,
      minY: box2.min.y,
      width: box2.max.x - box2.min.x,
      height: box2.max.y - box2.min.y,
    };

    // Clone every mesh's material once (so highlighting one mesh
    // never affects others that might share the same material),
    // and precompute which zone each mesh belongs to.
    const zones = [];
    ref.current.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        child.userData.originalEmissive = child.material.emissive
          ? child.material.emissive.clone()
          : new THREE.Color(0x000000);

        const meshBox = new THREE.Box3().setFromObject(child);
        const meshCenter = meshBox.getCenter(new THREE.Vector3());
        const zone = getZone(meshCenter.x, meshCenter.y, meshCenter.z);
        zones.push({ mesh: child, zone });
      }
    });
    meshZonesRef.current = zones;

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const distance = maxDim * 1.4;

    camera.position.set(distance, distance * 0.6, distance);
    camera.near = maxDim / 100;
    camera.far = maxDim * 100;
    camera.updateProjectionMatrix();
    camera.lookAt(0, size.y / 2, 0);

    if (controls) {
      controls.target.set(0, size.y / 2, 0);
      controls.update();
    }
  }, [scene, camera, controls]);

  const applyHighlight = (zone) => {
    if (currentZoneRef.current === zone) return;
    currentZoneRef.current = zone;

    meshZonesRef.current.forEach(({ mesh, zone: meshZone }) => {
      if (!mesh.material.emissive) return;
      if (meshZone === zone) {
        mesh.material.emissive.copy(HIGHLIGHT_COLOR);
        mesh.material.emissiveIntensity = 0.5;
      } else {
        mesh.material.emissive.copy(mesh.userData.originalEmissive);
        mesh.material.emissiveIntensity = 1;
      }
    });
  };

  useFrame((_, delta) => {
    if (autoRotate && ref.current) {
      ref.current.rotation.y += delta * 0.5;
    }
  });

  const handlePointerMove = (e) => {
    e.stopPropagation();
    const zone = getZone(e.point.x, e.point.y, e.point.z);
    applyHighlight(zone);
    onHover(zone, e.nativeEvent.clientX, e.nativeEvent.clientY);
  };

  const handlePointerOut = (e) => {
    e.stopPropagation();
    applyHighlight(null);
    onHover(null);
  };

  const handleClick = (e) => {
    e.stopPropagation();
    const zone = getZone(e.point.x, e.point.y, e.point.z);
    onSectionClick(zone);
  };

  return (
    <primitive
      ref={ref}
      object={scene}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    />
  );
}
