import { render, screen } from '@testing-library/react';

import RoomStatusBlock from './RoomStatusBlock';
import * as config from '../../config/singleRoom.config.js';

describe('RoomStatusBlock Component', () => {
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
          Subject: 'Meeting Subject',
          Organizer: 'Meeting Organizer',
          Start: 1532966400000,
          End: 1533344400000
        }
      ],
      Busy: true
    };

    details = {
      appointmentExists: true,
      nextUp: `${config.nextUp}:`
    };
  });

  it('shows a busy room with its current meeting details', () => {
    const { container } = render(
      <RoomStatusBlock room={room} details={details} config={config} />
    );

    expect(screen.getByText('Test Room')).toBeTruthy();
    expect(screen.getByText(config.statusBusy)).toBeTruthy();
    expect(container.querySelector('.left-col').classList.contains('busy')).toBe(true);
    expect(container.querySelector('.left-col').classList.contains('small-7')).toBe(true);
    expect(screen.getByText(`${config.nextUp}:`)).toBeTruthy();
    expect(screen.getByText('Meeting Subject')).toBeTruthy();
    expect(screen.getByText('Meeting Organizer')).toBeTruthy();
    expect(container.querySelector('#single-room__meeting-time').textContent).toMatch(
      /^\d{2}\.\d{2}\. \w{3} .+ - .+$/
    );
  });

  it('shows an available room with the open style', () => {
    room.Busy = false;

    const { container } = render(
      <RoomStatusBlock room={room} details={details} config={config} />
    );

    expect(screen.getByText(config.statusAvailable)).toBeTruthy();
    expect(container.querySelector('.left-col').classList.contains('open')).toBe(true);
  });

  it('shows the operational error instead of the occupancy status', () => {
    room.ErrorMessage = 'Calendar request failed';

    render(<RoomStatusBlock room={room} details={details} config={config} />);

    expect(screen.getByText('Error! Please contact IT.')).toBeTruthy();
    expect(screen.queryByText(config.statusBusy)).toBeNull();
  });

  it('leaves meeting details blank when no appointment exists', () => {
    details.appointmentExists = false;

    const { container } = render(
      <RoomStatusBlock room={room} details={details} config={config} />
    );

    expect(container.querySelector('#single-room__details').textContent).toBe('');
    expect(container.querySelector('#single-room__meeting-time').textContent).toBe('');
    expect(container.querySelector('#single-room__meeting-organizer').textContent).toBe('');
  });

  it('tolerates stale details after the current appointment was removed', () => {
    room.Appointments = [];
    details.appointmentExists = true;

    const { container } = render(
      <RoomStatusBlock room={room} details={details} config={config} />
    );

    expect(container.querySelector('#single-room__details').textContent).toBe('');
    expect(container.querySelector('#single-room__meeting-time').textContent).toBe('');
    expect(container.querySelector('#single-room__meeting-organizer').textContent).toBe('');
  });
});
