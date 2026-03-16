import React from 'react';
import { Route, Routes } from 'react-router-dom';
import CERV2Page from '@/pages/csr/CERV2Page';

export default function CERRoutes() {
  return (
    <Routes>
      <Route path="/cer" element={<CERV2Page />} />
    </Routes>
  );
}
