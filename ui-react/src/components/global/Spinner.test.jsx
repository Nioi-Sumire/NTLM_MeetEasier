import { render, screen } from '@testing-library/react';

import Spinner from './Spinner';

describe('Spinner component', () => {
  it('shows an accessible loading image', () => {
    render(<Spinner />);

    const image = screen.getByRole('img', { name: 'Loading...' });

    expect(image.getAttribute('src')).toBe('/svgs/spinner.svg');
  });
});
