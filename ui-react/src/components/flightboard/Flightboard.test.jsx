import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Flightboard from './Flightboard';

let socketPayload;

vi.mock('../global/Socket', () => ({
  default: ({ response }) => (
    <button type="button" data-testid="socket-update" onClick={() => response(socketPayload)}>
      Emit socket update
    </button>
  )
}));

describe('Flightboard component', () => {
  function room(name, overrides = {}) {
    return {
      Roomlist: 'First Floor',
      Name: name,
      RoomAlias: name.toLowerCase().replace(/\s+/g, '-'),
      Appointments: [],
      Busy: false,
      ...overrides
    };
  }

  function renderFlightboard() {
    return render(
      <MemoryRouter>
        <Flightboard filter="" />
      </MemoryRouter>
    );
  }

  beforeEach(() => {
    socketPayload = undefined;
    fetch.mockReset();
  });

  it('shows a spinner while the initial room request is pending', () => {
    fetch.mockReturnValue(new Promise(() => {}));

    renderFlightboard();

    expect(screen.getByRole('img', { name: 'Loading...' })).toBeTruthy();
  });

  it('renders rooms returned by the API', async () => {
    fetch.mockResolvedValue({
      json: () => Promise.resolve([room('Room One'), room('Room Two')])
    });

    renderFlightboard();

    expect(await screen.findByText('Room One')).toBeTruthy();
    expect(screen.getByText('Room Two')).toBeTruthy();
  });

  it('renders an API error instead of room rows', async () => {
    fetch.mockResolvedValue({
      json: () => Promise.resolve({ error: 'Credentials error' })
    });

    renderFlightboard();

    expect(await screen.findByText('Credentials error')).toBeTruthy();
    expect(screen.queryByText('Room One')).toBeNull();
  });

  it('replaces the displayed rooms after a socket update', async () => {
    fetch.mockResolvedValue({
      json: () => Promise.resolve([room('Room One')])
    });

    renderFlightboard();
    expect(await screen.findByText('Room One')).toBeTruthy();

    socketPayload = {
      response: true,
      now: new Date(),
      rooms: [room('Room Two')]
    };
    fireEvent.click(screen.getByTestId('socket-update'));

    expect(await screen.findByText('Room Two')).toBeTruthy();
    expect(screen.queryByText('Room One')).toBeNull();
  });
});
