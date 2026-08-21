import { fireEvent, render, screen } from '@testing-library/react';

import FlightboardLayout from './FlightboardLayout';

vi.mock('../components/flightboard/Navbar', () => ({
  default: ({ filter }) => (
    <button type="button" onClick={() => filter('roomlist-first-floor')}>
      Select first floor
    </button>
  )
}));

vi.mock('../components/flightboard/Flightboard', () => ({
  default: ({ filter }) => <div>Active filter: {filter || 'all'}</div>
}));

describe('FlightboardLayout Component', () => {
  it('shows all rooms initially', () => {
    render(<FlightboardLayout />);

    expect(screen.getByText('Active filter: all')).toBeTruthy();
  });

  it('passes a selected navbar filter to the flightboard', () => {
    render(<FlightboardLayout />);

    fireEvent.click(screen.getByRole('button', { name: 'Select first floor' }));

    expect(screen.getByText('Active filter: roomlist-first-floor')).toBeTruthy();
  });
});
