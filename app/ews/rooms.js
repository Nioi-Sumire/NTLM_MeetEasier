const httpntlm = require('httpntlm');
const xml2js = require('xml2js');
const auth = require('../../config/auth.js');
const blacklist = require('../../config/room-blacklist.js');

const DEBUG = false;

// LED-Statusdatei: schlanker Writer zur Entkopplung der GPIO-Ansteuerung
const fs = require('fs');
const path = require('path');

const TARGET_ROOM   = (process.env.DISPLAY_ROOM_ALIAS || '').toLowerCase();
// Optional überschreibbar; Standard liegt unter /run (flüchtig, geeignet für Status)
const LED_STATE_FILE = process.env.LED_STATE_FILE || '/run/room-led/state.json';

// In-Memory-Cache, um nur bei echten Änderungen zu schreiben
let __lastBusy = null;
let __lastError = null;

function writeLedState({ roomAlias, busy, error }) {
  if (!roomAlias) return;
  if (roomAlias.toLowerCase() !== TARGET_ROOM) return;
  const b = !!busy, e = !!error;
  if (__lastBusy === b && __lastError === e) return;
  __lastBusy = b; __lastError = e;

  const payload = { roomAlias, busy: b, error: e, ts: Date.now() };

  try { fs.mkdirSync(path.dirname(LED_STATE_FILE), { recursive: true }); } catch (_) {}

  const tmp = LED_STATE_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(payload));
    fs.renameSync(tmp, LED_STATE_FILE);
  } catch (_) {
    // LED-Schreiben ist Best-Effort; Fehler werden ignoriert
  }
}

if (DEBUG) console.log('NTLM Test', auth.exchange);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function getListOfRooms() {
  return new Promise(function (resolve, reject) {
    const soapBody = `
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
                     xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                     xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
        <soap:Header>
          <t:RequestServerVersion Version="Exchange2016"/>
        </soap:Header>
        <soap:Body>
          <m:GetRoomLists/>
        </soap:Body>
      </soap:Envelope>`;

    httpntlm.post({
      url: auth.exchange.uri,
      username: auth.exchange.username,
      password: auth.exchange.password,
      domain: auth.exchange.domain,
      workstation: '',
      headers: {
        'Content-Type': 'text/xml'
      },
      body: soapBody
    }, (err, res) => {
      if (err) {
        console.error('Fehler bei NTLM-Request:', err);
        return reject(err);
      }

      if (res.statusCode !== 200) {
        console.error('EWS antwortete mit Status:', res.statusCode);
        return reject(new Error('EWS Fehler ' + res.statusCode));
      }

      xml2js.parseString(res.body, { explicitArray: false }, (parseErr, result) => {
        if (parseErr) {
          console.error('Fehler beim XML-Parsing:', parseErr);
          return reject(parseErr);
        }

        try {
	  const roomListsRaw = result?.['s:Envelope']?.['s:Body']?.['m:GetRoomListsResponse']?.['m:RoomLists']?.['t:Address'];

          const roomLists = [];
          if (roomListsRaw) {
            if (Array.isArray(roomListsRaw)) {
              roomListsRaw.forEach(item => {
                roomLists.push({
                  Name: item['t:Name'],
                  Address: item['t:EmailAddress']
                });
              });
            } else {
              roomLists.push({
                Name: roomListsRaw['t:Name'],
                Address: roomListsRaw['t:EmailAddress']
              });
            }
          }

          if (DEBUG) console.log('Gefundene RoomLists:', roomLists);
          resolve(roomLists);
        } catch (e) {
          console.error('Fehler beim Auswerten der Antwort:', e);
          reject(e);
        }
      });
    });
  });
}

function getRoomsInLists(roomLists) {
  return new Promise(function (resolve, reject) {
    const allRooms = [];
    let processed = 0;

    roomLists.forEach(roomList => {
      const soapBody = `
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
                       xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                       xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
          <soap:Header>
            <t:RequestServerVersion Version="Exchange2016"/>
          </soap:Header>
          <soap:Body>
            <m:ExpandDL>
              <m:Mailbox>
                <t:EmailAddress>${roomList.Address}</t:EmailAddress>
              </m:Mailbox>
            </m:ExpandDL>
          </soap:Body>
        </soap:Envelope>`;

      httpntlm.post({
        url: auth.exchange.uri,
        username: auth.exchange.username,
        password: auth.exchange.password,
        domain: auth.exchange.domain,
        workstation: '',
        headers: {
          'Content-Type': 'text/xml'
        },
        body: soapBody
      }, (err, res) => {
        if (err || res.statusCode !== 200) {
          console.error('Fehler bei ExpandDL:', err || res.statusCode);
          processed++;
          if (processed === roomLists.length) resolve(allRooms);
          return;
        }

        xml2js.parseString(res.body, { explicitArray: false }, (parseErr, result) => {
          if (parseErr) {
            console.error('Fehler beim XML-Parsing (ExpandDL):', parseErr);
            processed++;
            if (processed === roomLists.length) resolve(allRooms);
            return;
          }

          try {
            const membersRaw = result['s:Envelope']['s:Body']['m:ExpandDLResponse']['m:ResponseMessages']['m:ExpandDLResponseMessage']['m:DLExpansion']['t:Mailbox'];

            let members = [];
            if (Array.isArray(membersRaw)) {
              members = membersRaw;
            } else if (membersRaw) {
              members = [membersRaw];
            }

            members.forEach(m => {
              if (!isRoomInBlacklist(m['t:EmailAddress'])) {
                allRooms.push({
                  Roomlist: roomList.Name,
                  Name: m['t:Name'],
                  RoomAlias: m['t:Name'].replace(/\s+/g, '-').toLowerCase(),
                  Email: m['t:EmailAddress']
                });
              }
            });

            if (DEBUG) console.log('Räume für Liste', roomList.Name, ':', members.length);
          } catch (e) {
            console.error('Fehler beim Auswerten von ExpandDL:', e);
          }

          processed++;
          if (processed === roomLists.length) {
            resolve(allRooms);
          }
        });
      });
    });
  });
}

function getAppointmentsForRooms(roomAddresses) {
  return new Promise(function (resolve, reject) {
    const context = {
      callback: resolve,
      itemsProcessed: 0,
      roomAddresses
    };

    roomAddresses.forEach(room => {
      const start = new Date();
      const end = new Date();
      end.setHours(end.getHours() + 240);

      const soapBody = `
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
                       xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
                       xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types">
          <soap:Header>
            <t:RequestServerVersion Version="Exchange2016"/>
          </soap:Header>
          <soap:Body>
            <m:FindItem Traversal="Shallow">
              <m:ItemShape>
                <t:BaseShape>AllProperties</t:BaseShape>
              </m:ItemShape>
              <m:CalendarView MaxEntriesReturned="6"
                              StartDate="${start.toISOString()}"
                              EndDate="${end.toISOString()}">
              </m:CalendarView>
              <m:ParentFolderIds>
                <t:DistinguishedFolderId Id="calendar">
                  <t:Mailbox>
                    <t:EmailAddress>${room.Email}</t:EmailAddress>
                  </t:Mailbox>
                </t:DistinguishedFolderId>
              </m:ParentFolderIds>
            </m:FindItem>
          </soap:Body>
        </soap:Envelope>`;

      httpntlm.post({
        url: auth.exchange.uri,
        username: auth.exchange.username,
        password: auth.exchange.password,
        domain: auth.exchange.domain,
        workstation: '',
        headers: {
          'Content-Type': 'text/xml'
        },
        body: soapBody
      }, (err, res) => {
        if (err) {
          fillRoomData(context, room, undefined, { errorMessage: err.message });
          return;
        }

        if (res.statusCode !== 200) {
          fillRoomData(context, room, undefined, { errorMessage: 'HTTP ' + res.statusCode });
          return;
        }

        xml2js.parseString(res.body, { explicitArray: false }, (parseErr, result) => {
          if (parseErr) {
            fillRoomData(context, room, undefined, { errorMessage: parseErr.message });
            return;
          }

          try {
            const itemsParent =
              result?.['s:Envelope']?.['s:Body']?.['m:FindItemResponse']?.['m:ResponseMessages']?.['m:FindItemResponseMessage']?.['m:RootFolder']?.['t:Items'];

            let appointments = [];
            if (itemsParent) {
              const rawItems = itemsParent['t:CalendarItem']
                ? (Array.isArray(itemsParent['t:CalendarItem']) ? itemsParent['t:CalendarItem'] : [itemsParent['t:CalendarItem']])
                : [];

              appointments = rawItems.map(item => {
                return {
                  Subject: item['t:Subject'] || '',
                  Organizer: item['t:Organizer']?.['t:Mailbox']?.['t:Name'] || '',
                  Start: new Date(item['t:Start']).getTime(),
                  End: new Date(item['t:End']).getTime(),
                  Sensitivity: item['t:Sensitivity']
                };
              });
            }

            fillRoomData(context, room, appointments);
          } catch (e) {
            fillRoomData(context, room, undefined, { errorMessage: e.message });
          }
        });
      });
    });
  });
}

function fillRoomData(context, room, appointments = [], option = {}) {
  room.Appointments = [];
  appointments.forEach(function (appt, index) {
    var start = processTime(appt.Start),
        end = processTime(appt.End),
        now = Date.now();

    room.Busy = index === 0
      ? start < now && now < end
      : room.Busy;

    let isAppointmentPrivate = appt.Sensitivity === 'Normal' ? false : true;
    let subject = isAppointmentPrivate ? 'Private' : appt.Subject;

    room.Appointments.push({
      Subject: subject,
      Organizer: appt.Organizer,
      Start: start,
      End: end,
      Private: isAppointmentPrivate
    });
  });

  if (option.errorMessage) {
    room.ErrorMessage = option.errorMessage;
  }

  writeLedState({
    roomAlias: room.RoomAlias,
    busy: !!room.Busy,
    error: !!room.ErrorMessage
  });

  context.itemsProcessed++;

  if (context.itemsProcessed === context.roomAddresses.length) {
    context.roomAddresses.sort((a, b) => a.Name.toLowerCase().localeCompare(b.Name.toLowerCase()));
    context.callback(context.roomAddresses);
  }
}

function processTime(timestamp) {
  return timestamp;
}

function isRoomInBlacklist(email) {
  return blacklist.some(blocked => email.toLowerCase().includes(blocked.toLowerCase()));
}

module.exports = function (callback) {
  getListOfRooms()
    .then(getRoomsInLists)
    .then(getAppointmentsForRooms)
    .then(function (rooms) {
      callback(null, rooms);
    })
    .catch(function (error) {
      console.error('Fehler beim Abrufen von Räumen:', error);
      callback(error);
    });
};
