import { Routes, Route } from 'react-router-dom';
import AboutPage from './pages/AboutPage';
import StatsPage from './pages/StatsPage';
import TermsPage from './pages/TermsPage';

// Only the pages we've ported live in the SPA. The legacy Fastify routes
// (/, /new, /report/:id) still serve the Eta template and are outside
// React Router's control — a full page navigation leaves the SPA.
export default function App() {
  return (
    <Routes>
      <Route path="/about" element={<AboutPage />} />
      <Route path="/stats" element={<StatsPage />} />
      <Route path="/terms" element={<TermsPage />} />
    </Routes>
  );
}
