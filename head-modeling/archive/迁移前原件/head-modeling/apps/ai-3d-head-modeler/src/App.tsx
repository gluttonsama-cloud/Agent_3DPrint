/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Guide from './pages/Guide';
import Upload from './pages/Upload';
import Processing from './pages/Processing';
import Preview from './pages/Preview';
import AnimePreview from './pages/AnimePreview';
import Order from './pages/Order';
import PaymentResult from './pages/PaymentResult';
import OrderHistory from './pages/OrderHistory';
import OrderStatus from './pages/OrderStatus';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Guide />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/anime-preview" element={<AnimePreview />} />
        <Route path="/processing" element={<Processing />} />
        <Route path="/preview" element={<Preview />} />
        <Route path="/order" element={<Order />} />
        <Route path="/payment" element={<PaymentResult />} />
        <Route path="/order-history" element={<OrderHistory />} />
        <Route path="/order-status" element={<OrderStatus />} />
      </Routes>
    </Router>
  );
}
