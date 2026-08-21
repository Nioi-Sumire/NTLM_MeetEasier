import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import * as config from '../../config/flightboard.config.js';

const Status = ({ room }) => {
  const statusClass = room.ErrorMessage
    ? 'meeting-error'
    : room.Busy
      ? 'meeting-busy'
      : 'meeting-open';

  let statusText = room.ErrorMessage
    ? config.board.statusError
    : room.Busy
      ? config.board.statusBusy
      : config.board.statusAvailable;

  return (
    <div className={room.RoomAlias + '-meeting-status ' + statusClass} title={room.ErrorMessage || ''}>
      {statusText}
    </div>
  );
};

const Subject = ({ room }) => {
  return (
    <div className={room.RoomAlias + '-meeting-information'}>
      {room.Appointments.length > 0 &&
        <div>
          <span className={room.RoomAlias + '-meeting-upcoming meeting-upcoming'}>
            {room.Busy ? '' : config.board.nextUp + ': '}
          </span>
          <span className={room.RoomAlias + '-subject meeting-subject'}>
            {room.Appointments[0].Subject}
          </span>
        </div>
      }
    </div>
  );
};

const Time = ({ room }) => {
  const formatTime = timestamp => new Date(parseInt(timestamp, 10)).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  return (
    <div className={room.RoomAlias + '-time meeting-time'}>
      {room.Appointments.length > 0 &&
        formatTime(room.Appointments[0].Start)
        + ' - ' +
        formatTime(room.Appointments[0].End)
      }
    </div>
  );
};

const Organizer = ({ room }) => {
  return (
    <div className={room.RoomAlias + '-organizer meeting-organizer'}>
      {room.Appointments.length > 0 &&
        room.Appointments[0].Organizer
      }
    </div>
  );
};

const FullScreenIcon = ({ room }) => {
  return (
    <div className="meeting-fullscreen">
      {!room.ErrorMessage &&
        <Link to={'/single-room/' + room.RoomAlias} target="_blank">
          <svg
            className="meeting-fullscreen-icon"
            viewBox="0 0 100 100"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M90.315 12.993H9.684c-3.119 0-5.644 2.528-5.644 5.645V67.83c0 3.118 2.526 5.645 5.644 5.645h30.359v8.556h-9.402c-.892 0-1.613.721-1.613 1.612v1.751c0 .892.721 1.613 1.613 1.613h37.901c.891 0 1.613-.721 1.613-1.613v-1.751c0-.892-.722-1.612-1.613-1.612h-8.586v-8.556h30.359c3.119 0 5.645-2.526 5.645-5.645V18.638c0-3.117-2.526-5.645-5.645-5.645zM14.091 63.508V22.949h71.818v40.559H14.091z" />
          </svg>
        </Link>
      }
    </div>
  );
};

const FlightboardRow = ({ room, filter }) => {
  const styles = {
    show: {display: 'block'},
    hide: {display: 'none'},
    flex: {display: 'flex'}
  }

  const roomlist = 'roomlist-' + room.Roomlist.toLowerCase().replace(/\s+/g, "-");

  // set row class based on meet room status
  let roomStatusClass = room.RoomAlias + ' meeting-room';
  roomStatusClass += room.Busy ? ' meeting-room-busy' : '';
  roomStatusClass += room.ErrorMessage ? ' meeting-room-error' : '';

  return (
    <div className={'meeting-room__row row-padder ' + roomlist} style={filter === roomlist || filter === 'roomlist-all' || filter === '' ? styles.show : styles.hide}>
      <div className="row">
        <div className="medium-12 columns">
          <div className={roomStatusClass}>
            <div className="row valign-middle">

              <div className={room.RoomAlias + '-status meeting-room__status medium-2 columns'}>
                <Status room={room} />
              </div>
              <div className="medium-3 columns">
                <div className={room.RoomAlias + '-name meeting-room__name'}>
                  {room.Name}
                </div>
              </div>
              <div className="medium-6 columns">
                <Subject room={room} />
                <Time room={room} />
                <Organizer room={room} />
              </div>
              <div className="medium-1 columns">
                <FullScreenIcon room={room} />
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

FlightboardRow.propTypes = {
  room: PropTypes.object,
  key: PropTypes.number,
  filter: PropTypes.string
};

export default FlightboardRow;
