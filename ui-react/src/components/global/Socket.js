import { Component } from 'react';
import PropTypes from 'prop-types';
import { io } from 'socket.io-client';

class Socket extends Component {
  componentDidMount = () => {
    this.socket = io();

    this.socket.on('updatedRooms', (rooms) => {
      this.props.response({
        response: true,
        now: new Date(),
        rooms: rooms
      });
    });
  }

  componentWillUnmount = () => {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  render() {
    return null;
  }
}

Socket.propTypes = {
  response: PropTypes.func
}

export default Socket;
