import { Stats } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useState } from "react";
import * as THREE from "three/webgpu";
import { Experience } from "./components/Experience";
import { useControls } from "leva";
import { PostProcessing } from "./components/PostProcessing";

function App() {
  const [frameloop, setFrameloop] = useState("never");

    const ppSettings = useControls("Post Processing", {
      strength: { value: 1.2, min: 0, max: 10, step: 0.1 },
      radius: { value: 0.5, min: 0, max: 10, step: 0.1 },
      threshold: { value: 0.25, min: 0, max: 1, step: 0.01 },
    });

  return (
    <>
      <Stats />
      <Canvas
        shadows
        camera={{ position: [3, 3, 5], fov: 30 }}
        frameloop={frameloop}
        gl={(canvas) => {
          const renderer = new THREE.WebGPURenderer({
            canvas,
            powerPreference: "high-performance",
            antialias: true,
            alpha: false,
            stencil: false,
          });

          renderer.init().then(() => {
            setFrameloop("always");
          });
          return renderer;
        }}
      >
        <Suspense>
          <Experience />
        </Suspense>
        <PostProcessing {...ppSettings} />
      </Canvas>
    </>
  );
}
export default App;
