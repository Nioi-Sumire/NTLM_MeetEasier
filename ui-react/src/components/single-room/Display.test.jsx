import { fireEvent, render, screen } from '@testing-library/react';

import Display from './Display';

let socketPayload;

vi.mock('../global/Socket', () => ({
  default: ({ response }) => (
    <button type="button" data-testid="socket-update" onClick={() => response(socketPayload)}>
      Emit socket update
    </button>
  )
}));

describe('Display Component', () => {
  const alias = 'test-room';

  function room(overrides = {}) {
    return {
      RoomAlias: alias,
      Name: 'Test Room',
      Appointments: [],
      Busy: false,
      ...overrides
    };
  }

  beforeEach(() => {
    socketPayload = undefined;
    fetch.mockReset();
  });

  it('renders the room returned by the initial API request', async () => {
    fetch.mockResolvedValue({
      json: () => Promise.resolve([
        room({
          Busy: true,
          Appointments: [{
            Subject: 'Meeting',
            Organizer: 'Organizer',
            Start: 1532966400000,
            End: 1532970000000
          }]
        })
      ])
    });

    render(<Display alias={alias} />);

    expect(await screen.findByText('Test Room')).toBeTruthy();
    expect(screen.getByText('Busy')).toBeTruthy();
    expect(screen.getByText('Meeting')).toBeTruthy();
  });

  it('clears appointment details when the final booking is removed', async () => {
    fetch.mockResolvedValue({
      json: () => Promise.resolve([
        room({
          Busy: true,
          Appointments: [{
            Subject: 'Meeting',
            Organizer: 'Organizer',
            Start: 1532966400000,
            End: 1532970000000
          }]
        })
      ])
    });

    render(<Display alias={alias} />);
    expect(await screen.findByText('Meeting')).toBeTruthy();

    socketPayload = { response: true, rooms: [room()] };
    fireEvent.click(screen.getByTestId('socket-update'));

    expect(await screen.findByText('Open')).toBeTruthy();
    expect(screen.queryByText('Meeting')).toBeNull();
    expect(screen.queryByText('Organizer')).toBeNull();
  });

  it('does not retain next-up state between room updates', async () => {
    fetch.mockResolvedValue({
      json: () => Promise.resolve([
        room({
          Appointments: [{
            Subject: 'Future Meeting',
            Organizer: 'Organizer',
            Start: 1532966400000,
            End: 1532970000000
          }]
        })
      ])
    });

    render(<Display alias={alias} />);
    expect(await screen.findByText('Next Up:')).toBeTruthy();

    socketPayload = { response: true, rooms: [room()] };
    fireEvent.click(screen.getByTestId('socket-update'));

    expect(screen.queryByText('Next Up:')).toBeNull();
  });
});
