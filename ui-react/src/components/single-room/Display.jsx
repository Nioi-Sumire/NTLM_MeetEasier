import React, { Component } from 'react';
import PropTypes from 'prop-types';
import * as config from '../../config/singleRoom.config.js';

import RoomStatusBlock from './RoomStatusBlock';
import Sidebar from './Sidebar';
import Socket from '../global/Socket';
import Spinner from '../global/Spinner';

class Display extends Component {
  constructor(props) {
    super(props);
    this.state = {
      response: false,
      roomAlias: this.props.alias,
      rooms: [],
      room: [],
      roomDetails: {
        appointmentExists: false,
        timesPresent: false,
        upcomingAppointments: false,
        nextUp: ''
      }
    }
  }

  getRoomsData = () => {
    return fetch('/api/rooms')
      .then((response) => response.json())
      .then((data) => {
        this.setState({
          rooms: data
        }, () => this.processRoomDetails());
      })
  }

  processRoomDetails = () => {
    const { rooms, roomAlias } = this.state;

    let roomArray = rooms.filter(item => item.RoomAlias === roomAlias);
    let room = roomArray[0];

    if (!room) {
      this.setState({
        response: false,
        room: [],
        roomDetails: {
          appointmentExists: false,
          timesPresent: false,
          upcomingAppointments: false,
          nextUp: ''
        }
      });
      return;
    }

    const appointments = Array.isArray(room.Appointments)
      ? room.Appointments
      : [];
    const firstAppointment = appointments[0];
    const appointmentExists = appointments.length > 0;
    const timesPresent = Boolean(
      firstAppointment && firstAppointment.Start && firstAppointment.End
    );

    // 1) ensure that appointments exist for the room
    // 2) check if there are more than 1 upcoming appointments
    // 3) check if there are times in the room.Start & room.End
    // 4) if the meeting is not going on now, append "Next Up: "
    this.setState({
      response: true,
      room: room,
      roomDetails: {
        appointmentExists: appointmentExists,
        timesPresent: timesPresent,
        upcomingAppointments: appointments.length > 1,
        nextUp: timesPresent && !room.Busy ? config.nextUp + ': ' : ''
      }
    });
  }

  handleSocket = (socketResponse) => {
    this.setState({
      rooms: socketResponse.rooms
    }, () => this.processRoomDetails());
  }

  componentDidMount = () => {
    this.getRoomsData();
  }

  render() {
    const { response, room, roomDetails } = this.state;

    return (
      <div>
        <Socket response={this.handleSocket}/>

        { response ?
          <div className="row expanded full-height">
            <RoomStatusBlock room={room} details={roomDetails} config={config} />
            <Sidebar room={room} details={roomDetails} config={config} />
          </div>
        :
          <Spinner />
        }
      </div>
    );
  }
}

Display.propTypes = {
  alias: PropTypes.string
}

export default Display;
