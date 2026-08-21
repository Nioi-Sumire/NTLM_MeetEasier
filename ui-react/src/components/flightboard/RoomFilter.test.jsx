import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import RoomFilter from './RoomFilter';

describe('Flightboard RoomFilter', () => {
  let mockFilter;
  let props;

  beforeEach(() => {
    mockFilter = vi.fn();
    props = {
      response: true,
      error: false,
      roomlists: [
        'Roomlist Number One',
        'Roomlist Number Two'
      ]
    };
  });

  it('renders the available room-list choices', () => {
    render(<RoomFilter {...props} filter={mockFilter} />);

    expect(screen.getByRole('button', { name: 'Locations' })).toBeTruthy();
    expect(screen.getByText('All Conference Rooms')).toBeTruthy();
    expect(screen.getByText('Roomlist Number One')).toBeTruthy();
    expect(screen.getByText('Roomlist Number Two')).toBeTruthy();
    expect(screen.queryByText('Loading ...')).toBeNull();
  });

  it.each([
    { response: false, error: false },
    { response: true, error: true },
    { response: false, error: true }
  ])('shows a loading entry for response=$response and error=$error', (state) => {
    render(<RoomFilter {...props} {...state} filter={mockFilter} />);

    expect(screen.getByText('Loading ...')).toBeTruthy();
    expect(screen.queryByText('Roomlist Number One')).toBeNull();
  });

  it('opens, selects a filter and closes the menu', async () => {
    const user = userEvent.setup();
    render(<RoomFilter {...props} filter={mockFilter} />);

    const toggle = screen.getByRole('button', { name: 'Locations' });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    await user.click(screen.getByText('Roomlist Number One'));

    expect(mockFilter).toHaveBeenCalledWith('roomlist-roomlist-number-one');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
