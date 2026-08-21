import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import SingleRoomLayout from './SingleRoomLayout';

vi.mock('../components/single-room/Display', () => ({
  default: ({ alias }) => <div>Display for {alias}</div>
}));

describe('SingleRoomLayout Component', () => {
  it('passes the route alias to the room display', () => {
    render(
      <MemoryRouter initialEntries={['/single-room/test-room']}>
        <Routes>
          <Route path="/single-room/:name" element={<SingleRoomLayout />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Display for test-room')).toBeTruthy();
  });

  it('shows the not-found explanation when the alias is empty', () => {
    render(
      <MemoryRouter initialEntries={['/single-room']}>
        <Routes>
          <Route path="/single-room" element={<SingleRoomLayout />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Sorry :(')).toBeTruthy();
  });
});
