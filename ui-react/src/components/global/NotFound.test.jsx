import { render, screen } from '@testing-library/react';

import NotFound from './NotFound';

describe('NotFound component', () => {
  it('explains that the requested page could not be displayed', () => {
    render(<NotFound />);

    expect(screen.getByText('Sorry :(')).toBeTruthy();
    expect(
      screen.getByText(
        'Either there was an error in processing or this page does not exist.'
      )
    ).toBeTruthy();
  });
});
