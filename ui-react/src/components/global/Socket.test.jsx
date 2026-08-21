import { act, render } from '@testing-library/react';

import Socket from './Socket';

const { socket, createSocket } = vi.hoisted(() => ({
  socket: {
    on: vi.fn(),
    close: vi.fn()
  },
  createSocket: vi.fn()
}));

vi.mock('socket.io-client', () => ({
  io: createSocket
}));

describe('Socket component', () => {
  beforeEach(() => {
    socket.on.mockReset();
    socket.close.mockReset();
    createSocket.mockReset();
    createSocket.mockReturnValue(socket);
  });

  it('forwards updated rooms with response metadata', () => {
    const response = vi.fn();
    const rooms = [{ RoomAlias: 'test-room' }];

    render(<Socket response={response} />);

    expect(socket.on).toHaveBeenCalledWith('updatedRooms', expect.any(Function));
    const updateRooms = socket.on.mock.calls[0][1];

    act(() => {
      updateRooms(rooms);
    });

    expect(response).toHaveBeenCalledWith({
      response: true,
      now: expect.any(Date),
      rooms
    });
  });

  it('closes the same connection when removed', () => {
    const { unmount } = render(<Socket response={vi.fn()} />);

    unmount();

    expect(createSocket).toHaveBeenCalledTimes(1);
    expect(socket.close).toHaveBeenCalledTimes(1);
  });
});
