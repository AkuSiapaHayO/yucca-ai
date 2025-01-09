import { Environment, OrbitControls, useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Yucca } from "./Yucca";

const Experience = () => {
  const background = useTexture("textures/background.jpeg");
  const viewport = useThree((state) => state.viewport);

  return (
    <>
      <OrbitControls enableZoom={false} enableRotate={false} enablePan={false} />
      <Yucca position={[0, -1.3, 1]} scale={0.6} />
      <Environment preset="lobby" />
      <mesh>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <meshBasicMaterial map={background} />
      </mesh>
    </>
  );
};

export default Experience;
