import { Environment, OrbitControls, useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Yucca } from "./Yucca";

const Experience = () => {
  return (
    <>
      <OrbitControls
        enableZoom={false}
        enableRotate={false}
        enablePan={false}
      />
      <Yucca position={[0, -1.3, 1]} scale={0.6} /> 
      <Environment preset="lobby" />
    </>
  );
};

export default Experience;
