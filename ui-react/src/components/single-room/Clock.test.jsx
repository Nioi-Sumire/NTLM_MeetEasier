import { act, render } from '@testing-library/react';

import Clock from './Clock';

describe('Single Room Clock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T09:15:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the date and updates the visible minute', () => {
    const { container } = render(<Clock />);
    const time = container.querySelector('#single-room__time');
    const date = container.querySelector('#single-room__date');
    const initialTime = time.textContent;

    expect(initialTime).not.toBe('');
    expect(date.textContent).not.toBe('');

    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });

    expect(time.textContent).not.toBe(initialTime);
  });

  it('stops its interval when removed', () => {
    const { unmount } = render(<Clock />);

    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
