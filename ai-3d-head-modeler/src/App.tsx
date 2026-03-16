/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Guide from './pages/Guide';
import Upload from './pages/Upload';
import Processing from './pages/Processing';
import Preview from './pages/Preview';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Guide />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/processing" element={<Processing />} />
        <Route path="/preview" element={<Preview />} />
      </Routes>
    </Router>
  );
}
