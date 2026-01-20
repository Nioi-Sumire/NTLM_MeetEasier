import React from 'react';
import PropTypes from 'prop-types';

const Details = ({room, details}) => (
  <div id="single-room__details">
    { details.appointmentExists &&
      <div id="single-room__meeting-title">
        <span id="single-room__next-up">
          {details.nextUp}
        </span>
        <span id="single-room__meeting-subject">
          {room.Appointments[0].Subject}
        </span>
      </div>
    }
  </div>
);

const Time = ({room, details}) => (
  <div id="single-room__meeting-time">
    { details.appointmentExists &&
      // Zeitformatierung: TT.MM. Wochentag HH:MM - HH:MM
      (() => {
        const start = new Date(parseInt(room.Appointments[0].Start, 10));
        const end = new Date(parseInt(room.Appointments[0].End, 10));
        const weekday = start.toLocaleDateString('en-US', { weekday: 'short' });
        const day = String(start.getDate()).padStart(2, '0');
        const month = String(start.getMonth() + 1).padStart(2, '0');
        const startTime = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `${day}.${month}. ${weekday} ${startTime} - ${endTime}`;
      })()
    }
  </div>
);

const Organizer = ({room, details}) => {
  return(
    <div id="single-room__meeting-organizer">
      {details.appointmentExists &&
        room.Appointments[0].Organizer
      }
    </div>
  );
};

const RoomStatusBlock = ({ config, details, room }) => {
  // Prüfen ob ErrorMessage gesetzt ist
  let statusText;
  if (room.ErrorMessage) {
    statusText = "Error! Please contact IT.";
  } else {
    statusText = room.Busy ? config.statusBusy : config.statusAvailable;
  }

  return (
    <div className={room.Busy ? 'columns small-8 left-col busy' : 'columns small-8 left-col open'}>
      <div id="single-room__room-name">{room.Name}</div>
      <div id="single-room__room-status">{statusText}</div>

      <Details room={room} details={details} />
      <Time room={room} details={details} />
      <Organizer room={room} details={details} />
    </div>
  );
};

RoomStatusBlock.propTypes = {
  room: PropTypes.object.isRequired,
  details: PropTypes.object,
  config: PropTypes.object
}

export default RoomStatusBlock;
