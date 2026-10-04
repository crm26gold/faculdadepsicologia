'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { MathUtils, type Group } from 'three';

type Point = { x: number; y: number };

function Sculpture({ point }: { point: RefObject<Point> }) {
  const group = useRef<Group>(null);
  const invalidate = useThree((state) => state.invalidate);

  useFrame((_, delta) => {
    if (!group.current) return;
    const targetX = -0.3 + point.current.y * 0.12;
    const targetY = point.current.x * 0.3;
    group.current.rotation.x = MathUtils.damp(group.current.rotation.x, targetX, 5, Math.min(delta, 0.05));
    group.current.rotation.y = MathUtils.damp(group.current.rotation.y, targetY, 5, Math.min(delta, 0.05));
    // Demand rendering stops when the pointer settles; no continuous GPU loop.
    if (Math.abs(group.current.rotation.x - targetX) + Math.abs(group.current.rotation.y - targetY) > 0.001) invalidate();
  });

  return (
    <group ref={group} rotation={[-0.3, 0, -0.22]}>
      <mesh>
        <sphereGeometry args={[1.06, 48, 48]} />
        <meshPhysicalMaterial color="#174C72" roughness={0.24} metalness={0.45} clearcoat={1} clearcoatRoughness={0.18} />
      </mesh>
      <mesh rotation={[Math.PI / 2.7, 0.28, 0.2]}>
        <torusGeometry args={[1.6, 0.035, 12, 128]} />
        <meshStandardMaterial color="#A3BCD0" metalness={0.72} roughness={0.25} />
      </mesh>
      <mesh rotation={[Math.PI / 2.4, -0.52, -0.4]}>
        <torusGeometry args={[1.9, 0.012, 8, 128]} />
        <meshStandardMaterial color="#C49A48" metalness={0.55} roughness={0.3} />
      </mesh>
      <mesh position={[1.52, 0.24, 0.38]}>
        <sphereGeometry args={[0.13, 20, 20]} />
        <meshStandardMaterial color="#DDBB77" metalness={0.5} roughness={0.22} />
      </mesh>
      <mesh position={[-1.42, -0.68, 0.3]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial color="#417A9F" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function JourneyScene({ onReady, onFailure }: { onReady: () => void; onFailure: () => void }) {
  const point = useRef<Point>({ x: 0, y: 0 });
  const invalidate = useRef<(() => void) | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvas) return;
    const lost = () => onFailure();
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [canvas, onFailure]);

  return (
    <SceneBoundary onFailure={onFailure}>
      <div style={{ width: '100%', height: '100%' }}
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          point.current = { x: (event.clientX - bounds.left) / bounds.width * 2 - 1, y: (event.clientY - bounds.top) / bounds.height * 2 - 1 };
          invalidate.current?.();
        }}
        onPointerLeave={() => { point.current = { x: 0, y: 0 }; invalidate.current?.(); }}
      >
        <Canvas
          frameloop="demand"
          dpr={[1, 1.5]}
          camera={{ position: [0, 0, 6], fov: 43 }}
          gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
          fallback={null}
          onCreated={({ gl, invalidate: requestFrame }) => {
            setCanvas(gl.domElement);
            invalidate.current = requestFrame;
            onReady();
          }}
        >
          <ambientLight intensity={2} />
          <directionalLight position={[-3, 4, 5]} intensity={4} color="#EAF5FF" />
          <directionalLight position={[3, -1, 2]} intensity={1.5} color="#D3B579" />
          <Sculpture point={point} />
        </Canvas>
      </div>
    </SceneBoundary>
  );
}
