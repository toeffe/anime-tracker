import { HashRouter, Routes, Route } from "react-router-dom";
import { LibraryPage } from "./pages/LibraryPage";
import { MediaDetailPage } from "./pages/MediaDetailPage";
import { SuggestionDetailPage } from "./pages/SuggestionDetailPage";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/media/:id" element={<MediaDetailPage />} />
        <Route path="/suggest/:source/:id" element={<SuggestionDetailPage />} />
      </Routes>
    </HashRouter>
  );
}
