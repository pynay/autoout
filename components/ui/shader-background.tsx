"use client"

import { Canvas } from "@react-three/fiber"
import { ShaderPlane } from "./background-paper-shaders"

const PALETTES: Array<[string, string]> = [
  ["#7c3aed", "#22d3ee"],
  ["#6366f1", "#a78bfa"],
  ["#4f46e5", "#06b6d4"],
  ["#8b5cf6", "#3b82f6"],
  ["#a855f7", "#0ea5e9"],
  ["#6d28d9", "#22d3ee"],
  ["#7c3aed", "#a78bfa"],
  ["#3730a3", "#8b5cf6"],
  ["#5b21b6", "#06b6d4"],
]

export function ShaderBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background"
    >
      <Canvas
        camera={{ position: [0, 0, 2.3], fov: 60 }}
        gl={{ antialias: true, alpha: true, premultipliedAlpha: false }}
        dpr={[1, 1.5]}
      >
        {PALETTES.map((pair, i) => {
          const col = i % 3
          const row = Math.floor(i / 3)
          const x = (col - 1) * 1.85
          const y = (1 - row) * 1.6
          return (
            <ShaderPlane
              key={i}
              position={[x, y, -0.4 + ((i * 13) % 7) * 0.08]}
              color1={pair[0]}
              color2={pair[1]}
            />
          )
        })}
      </Canvas>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 100%, oklch(0.13 0.012 275 / 60%), transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0 mix-blend-overlay opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
        }}
      />
    </div>
  )
}
