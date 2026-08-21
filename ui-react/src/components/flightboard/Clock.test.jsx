import { act, render } from '@testing-library/react';

import Clock from './Clock';

describe('Flightboard Clock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T09:15:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updates the visible time every second', () => {
    const { container } = render(<Clock />);
    const clock = container.querySelector('#clock');
    const initialTime = clock.textContent;

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(clock.textContent).not.toBe(initialTime);
  });

  it('stops its interval when removed', () => {
    const { unmount } = render(<Clock />);

    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
