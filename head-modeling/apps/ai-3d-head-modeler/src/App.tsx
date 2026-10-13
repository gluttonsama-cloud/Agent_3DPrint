/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Guide from './pages/Guide';
import Upload from './pages/Upload';
import Processing from './pages/Processing';
import Preview from './pages/Preview';
import Preprocess from './pages/Preprocess';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Guide />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/preprocess" element={<Preprocess />} />
        <Route path="/anime-preview" element={<Navigate to="/upload" replace />} />
        <Route path="/processing" element={<Processing />} />
        <Route path="/preview" element={<Preview />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
