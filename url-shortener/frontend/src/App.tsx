import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import UrlShortener from "./components/urlShortener/UrlShortener";
import RedirectHandler from "./components/redirectHandler/RedirectHandler";
import NotFound from "./components/notFound/NotFound";
import Navbar from "./components/navbar/Navbar";

const App: React.FC = () => {
  return (
    <Router>
      <Navbar />
      <Routes>
        <Route path="/" element={<UrlShortener />} />
        <Route path="/:shortUrl" element={<RedirectHandler />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
};

export default App;
