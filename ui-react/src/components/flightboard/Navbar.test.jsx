import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Navbar from './Navbar';

describe('Flightboard Navbar', () => {
  let mockFilter;

  beforeEach(() => {
    mockFilter = vi.fn();
    fetch.mockResolvedValue({
      json: () => Promise.resolve(['Roomlist Number One'])
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title, logo, clock and room filter', async () => {
    render(<Navbar filter={mockFilter} />);

    expect(screen.getByText('Conference Room Availability')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Logo' })).toBeTruthy();
    expect(document.querySelector('#clock')).toBeTruthy();
    expect(await screen.findByText('Roomlist Number One')).toBeTruthy();
  });

  it('forwards a selected room-list filter', async () => {
    const user = userEvent.setup();
    render(<Navbar filter={mockFilter} />);

    await user.click(screen.getByRole('button', { name: 'Locations' }));
    await user.click(await screen.findByText('Roomlist Number One'));

    expect(mockFilter).toHaveBeenCalledWith('roomlist-roomlist-number-one');
  });
});
