import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import './index.css';

import FlightboardLayout from './layouts/FlightboardLayout';
import SingleRoomLayout from './layouts/SingleRoomLayout';
import NotFound from './components/global/NotFound';

const root = createRoot(document.getElementById('app'));

root.render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<FlightboardLayout />} />
      <Route path="/single-room/:name" element={<SingleRoomLayout />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
);
