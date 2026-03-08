import "@fontsource/chivo/700.css";
import "@fontsource/chivo/400.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import ResearchPage from "@/pages/ResearchPage";
import FrankensteinPage from "@/pages/FrankensteinPage";
import WalkForwardPage from "@/pages/WalkForwardPage";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/research" element={<ResearchPage />} />
            <Route path="/frankenstein" element={<FrankensteinPage />} />
            <Route path="/walkforward" element={<WalkForwardPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </div>
  );
}

export default App;
