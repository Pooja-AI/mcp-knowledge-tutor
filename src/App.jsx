import { HashRouter, Routes, Route } from "react-router-dom";
import MCP from "./pages/MCPCookBook";
import Navbar from "./components/Navbar";

function App() {
  return (
    <HashRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<MCP/>} />
      </Routes>
    </HashRouter>
  );
}


export default App;