import { Canvas } from "@react-three/fiber";
import Experience from "./components/Experience";
import Interface from "./components/Interface";
import { Loader } from "@react-three/drei";
import { Leva } from "leva";
import { ChatProvider } from "./hooks/Hooks";

const App = () => {
  return (
    <>
      <Loader />
      <Leva hidden />
      <ChatProvider>
        <Interface />
        <Canvas shadows camera={{ position: [0, 0, 8], fov: 30 }}>
          <Experience />
        </Canvas>
      </ChatProvider>
    </>
  );
};
export default App;
