import { render, screen } from '@testing-library/react';

import Sidebar from './Sidebar';
import * as config from '../../config/singleRoom.config.js';

describe('Sidebar Component', () => {
  let room;
  let details;

  beforeEach(() => {
    room = {
      Roomlist: 'Test Roomlist',
      Name: 'Test Room',
      RoomAlias: 'test-room',
      Email: 'email@email.com',
      Appointments: [
        {
          Subject: 'Current Meeting',
          Organizer: 'Current Organizer',
          Start: 1532966400000,
          End: 1533344400000
        },
        {
          Subject: 'Meeting Two Subject',
          Organizer: 'Meeting Two Organizer',
          Start: 1532966400000,
          End: 1533344400000
        }
      ],
      Busy: true
    };

    details = {
      appointmentExists: true,
      upcomingAppointments: false,
      nextUp: ''
    };
  });

  it('renders the clock and configured upcoming title', () => {
    const { container } = render(
      <Sidebar room={room} details={details} config={config} />
    );

    expect(container.querySelector('#single-room__clock')).toBeTruthy();
    expect(screen.getByText(config.upcomingTitle)).toBeTruthy();
    expect(container.querySelector('.right-col').classList.contains('small-5')).toBe(true);
  });

  it('does not show future meetings when none are marked as upcoming', () => {
    render(<Sidebar room={room} details={details} config={config} />);

    expect(screen.queryByText('Meeting Two Subject')).toBeNull();
  });

  it('shows future meetings but omits the current appointment', () => {
    details.upcomingAppointments = true;

    const { container } = render(
      <Sidebar room={room} details={details} config={config} />
    );

    expect(screen.queryByText('Current Meeting')).toBeNull();
    expect(screen.getByText('Meeting Two Subject')).toBeTruthy();
    expect(container.querySelector('.up__meeting-time').textContent).toMatch(
      /^\d{2}\.\d{2}\. \w{3} \d{2}:\d{2} - \d{2}:\d{2}$/
    );
  });

  it('leaves the meeting time blank when start or end is missing', () => {
    details.upcomingAppointments = true;
    room.Appointments[1].Start = '';
    room.Appointments[1].End = '';

    const { container } = render(
      <Sidebar room={room} details={details} config={config} />
    );

    expect(container.querySelector('.up__meeting-time').textContent).toBe('');
  });
});
