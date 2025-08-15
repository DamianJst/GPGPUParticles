import { Environment, OrbitControls } from "@react-three/drei";
import { GPGPUParticles } from "./GPGPUParticles";

export const Experience = () => {
  return (
    <>
      {/* <Environment preset="warehouse" /> */}
      <OrbitControls />
      <GPGPUParticles
        // nbParticles={1000} 
      />
    </>
  );
};
