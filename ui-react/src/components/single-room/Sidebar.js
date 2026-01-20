import React from 'react';
import PropTypes from 'prop-types';

import Clock from './Clock';

// Hilfsfunktion für Datum + Wochentag
const formatStart = (timestamp) => {
  const date = new Date(parseInt(timestamp, 10));
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'short' }); // z.B. Wed
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day}.${month}. ${weekday} ${time}`;
};

// Hilfsfunktion nur für Uhrzeit (Ende)
const formatTimeOnly = (timestamp) => {
  const date = new Date(parseInt(timestamp, 10));
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const Sidebar = ({ config, details, room }) => (
  <div className="columns small-4 right-col">
    <div id="single-room__clock-wrap">
      <Clock />
    </div>
    <div id="upcoming-title">
      {config.upcomingTitle}
    </div>
    <table>
      { details.upcomingAppointments ?
        room.Appointments.slice(1).map((item, key) => {
          return (
            <tr key={key}>
              <td className="up__meeting-title">{item.Subject}</td>
              <td className="up__meeting-time" width="44%">
                { item.Start && item.End ?
                  formatStart(item.Start) + ' - ' + formatTimeOnly(item.End)
                  :
                  ''
                }
              </td>
            </tr>
          );
        })
      :
        ''
      }
    </table>
  </div>
);

Sidebar.propTypes = {
  room: PropTypes.object,
  details: PropTypes.object,
  config: PropTypes.object
}

export default Sidebar;
