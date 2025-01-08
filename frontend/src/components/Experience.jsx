import { Environment, OrbitControls, useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Yucca } from "./Yucca";

const Experience = () => {
  const background = useTexture("textures/background.jpeg");
  const viewport = useThree((state) => state.viewport);

  return (
    <>
      <OrbitControls enableZoom={false} enableRotate={false} enablePan={false} />
      <Yucca position={[0, -2.5, 1]} scale={0.8} />
      <Environment preset="lobby" />
      <mesh>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <meshBasicMaterial map={background} />
      </mesh>
    </>
  );
};

export default Experience;
