import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import FlightboardRow from './FlightboardRow';
import * as config from '../../config/flightboard.config.js';

describe('Flightboard Row Component', () => {
  let room;

  beforeEach(() => {
    room = {
      Roomlist: 'Test Roomlist',
      Name: 'Test Room',
      RoomAlias: 'test-room',
      Email: 'email@email.com',
      Appointments: [
        {
          Subject: 'Meeting Subject',
          Organizer: 'John Doe',
          Start: new Date(2018, 6, 30, 9, 0).getTime(),
          End: new Date(2018, 6, 30, 18, 0).getTime()
        }
      ],
      Busy: true
    };
  });

  function renderRow(filter = '') {
    return render(
      <MemoryRouter>
        <FlightboardRow room={room} filter={filter} />
      </MemoryRouter>
    );
  }

  it('shows a busy room with its current appointment and single-room link', () => {
    const { container } = renderRow();

    expect(screen.getByText('Test Room')).toBeTruthy();
    expect(screen.getByText(config.board.statusBusy)).toBeTruthy();
    expect(container.querySelector('.meeting-room').classList.contains('meeting-room-busy')).toBe(true);
    expect(container.querySelector('.meeting-busy')).toBeTruthy();
    expect(screen.getByText('Meeting Subject')).toBeTruthy();
    expect(screen.getByText('John Doe')).toBeTruthy();
    expect(screen.getByText('09:00 - 18:00')).toBeTruthy();

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/single-room/test-room');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('shows an available room and labels its appointment as next up', () => {
    room.Busy = false;

    const { container } = renderRow();

    expect(screen.getByText(config.board.statusAvailable)).toBeTruthy();
    expect(container.querySelector('.meeting-open')).toBeTruthy();
    expect(container.querySelector('.meeting-room').classList.contains('meeting-room-busy')).toBe(false);
    expect(screen.getByText('Next Up:')).toBeTruthy();
  });

  it('shows calendar errors and suppresses the single-room link', () => {
    room.ErrorMessage = 'Houston, we have a problem.';

    const { container } = renderRow();

    expect(screen.getByText(config.board.statusError)).toBeTruthy();
    expect(container.querySelector('.meeting-error').getAttribute('title')).toBe(
      'Houston, we have a problem.'
    );
    expect(container.querySelector('.meeting-room').classList.contains('meeting-room-error')).toBe(true);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('leaves appointment fields blank when the room has no appointments', () => {
    room.Appointments = [];

    const { container } = renderRow();

    expect(container.querySelector('.meeting-subject')).toBeNull();
    expect(container.querySelector('.meeting-time').textContent).toBe('');
    expect(container.querySelector('.meeting-organizer').textContent).toBe('');
  });

  it.each([
    ['', 'block'],
    ['roomlist-all', 'block'],
    ['roomlist-test-roomlist', 'block'],
    ['roomlist-another-floor', 'none']
  ])('shows filter %s with display %s', (filter, expectedDisplay) => {
    const { container } = renderRow(filter);

    expect(container.querySelector('.meeting-room__row').style.display).toBe(expectedDisplay);
  });

  it('adds a normalized room-list class to the row', () => {
    const { container } = renderRow();

    expect(
      container.querySelector('.meeting-room__row').classList.contains('roomlist-test-roomlist')
    ).toBe(true);
  });
});
