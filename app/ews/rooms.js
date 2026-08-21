const xml2js = require('xml2js');
const blacklist = require('../../config/room-blacklist.js');
const ewsClient = require('./client.js');
const ledStateWriter = require('../led-state-writer.js');

function createEwsError(operation, message, properties = {}) {
  const error = new Error(`EWS ${operation} failed: ${message}`);
  error.operation = operation;
  Object.assign(error, properties);
  return error;
}

function createRoomsService(dependencies = {}) {
  const client = dependencies.ewsClient || ewsClient;
  const parser = dependencies.xml2js || xml2js;
  const roomBlacklist = dependencies.blacklist || blacklist;
  const logger = dependencies.logger || console;
  const roomStateWriter = dependencies.ledStateWriter || ledStateWriter;

  function parseXml(operation, body) {
    return new Promise((resolve, reject) => {
      parser.parseString(body, { explicitArray: false }, (err, result) => {
        if (err) {
          return reject(createEwsError(operation, `invalid XML: ${err.message}`, {
            code: 'EWS_INVALID_XML'
          }));
        }

        resolve(result);
      });
    });
  }

  function post(operation, soapBody) {
    return new Promise((resolve, reject) => {
      client.post(operation, soapBody, (err, res) => {
        if (err) return reject(err);

        if (!res || res.statusCode !== 200) {
          const statusCode = res && res.statusCode;
          return reject(createEwsError(operation, `HTTP ${statusCode || 'response missing'}`, {
            code: 'EWS_HTTP_ERROR',
            statusCode
          }));
        }

        resolve(res.body);
      });
    });
  }

  function assertEwsSuccess(operation, responseMessage) {
    if (!responseMessage) return;

    const responseClass = responseMessage.$ && responseMessage.$.ResponseClass;
    const responseCode = responseMessage['m:ResponseCode'];

    if (responseClass === 'Error' || (responseCode && responseCode !== 'NoError')) {
      throw createEwsError(operation, responseCode || responseClass || 'unknown response error', {
        code: 'EWS_RESPONSE_ERROR',
        responseCode
      });
    }
  }

  function normalizeRoomLists(result) {
    const response = result?.['s:Envelope']?.['s:Body']?.['m:GetRoomListsResponse'];
    const responseMessage = response?.['m:ResponseMessages']?.['m:GetRoomListsResponseMessage'];
    assertEwsSuccess('GetRoomLists', responseMessage);

    const roomListsRaw = responseMessage?.['m:RoomLists']?.['t:Address']
      || response?.['m:RoomLists']?.['t:Address'];
    const entries = Array.isArray(roomListsRaw)
      ? roomListsRaw
      : roomListsRaw
        ? [roomListsRaw]
        : [];

    return entries.map(item => ({
      Name: item['t:Name'],
      Address: item['t:EmailAddress'] || item._ || item
    })).filter(item => item.Name && typeof item.Address === 'string');
  }

  function normalizeRooms(result, roomList) {
    const responseMessage = result?.['s:Envelope']?.['s:Body']
      ?.['m:ExpandDLResponse']?.['m:ResponseMessages']?.['m:ExpandDLResponseMessage'];
    assertEwsSuccess('ExpandDL', responseMessage);

    if (!responseMessage) {
      throw createEwsError('ExpandDL', 'response message missing', {
        code: 'EWS_INVALID_RESPONSE'
      });
    }

    const membersRaw = responseMessage?.['m:DLExpansion']?.['t:Mailbox'];
    const members = Array.isArray(membersRaw)
      ? membersRaw
      : membersRaw
        ? [membersRaw]
        : [];

    return members.filter(member => {
      const email = member['t:EmailAddress'];
      return email && !isRoomInBlacklist(email);
    }).map(member => ({
      Roomlist: roomList.Name,
      Name: member['t:Name'],
      RoomAlias: member['t:Name'].replace(/\s+/g, '-').toLowerCase(),
      Email: member['t:EmailAddress']
    }));
  }

  function normalizeAppointments(result) {
    const responseMessage = result?.['s:Envelope']?.['s:Body']
      ?.['m:FindItemResponse']?.['m:ResponseMessages']?.['m:FindItemResponseMessage'];
    assertEwsSuccess('FindItem', responseMessage);

    if (!responseMessage) {
      throw createEwsError('FindItem', 'response message missing', {
        code: 'EWS_INVALID_RESPONSE'
      });
    }

    const itemsParent = responseMessage?.['m:RootFolder']?.['t:Items'];
    const calendarItems = itemsParent?.['t:CalendarItem'];
    const rawItems = Array.isArray(calendarItems)
      ? calendarItems
      : calendarItems
        ? [calendarItems]
        : [];

    return rawItems.map(item => ({
      Subject: item['t:Subject'] || '',
      Organizer: item['t:Organizer']?.['t:Mailbox']?.['t:Name'] || '',
      Start: new Date(item['t:Start']).getTime(),
      End: new Date(item['t:End']).getTime(),
      Sensitivity: item['t:Sensitivity']
    }));
  }

  function getListOfRooms() {
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

    return post('GetRoomLists', soapBody)
      .then(body => parseXml('GetRoomLists', body))
      .then(normalizeRoomLists);
  }

  function getRoomsInLists(roomLists) {
    if (roomLists.length === 0) return Promise.resolve([]);

    return Promise.all(roomLists.map(roomList => {
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

      return post('ExpandDL', soapBody)
        .then(body => parseXml('ExpandDL', body))
        .then(result => normalizeRooms(result, roomList));
    })).then(roomGroups => [].concat(...roomGroups));
  }

  function getAppointmentsForRooms(rooms) {
    if (rooms.length === 0) return Promise.resolve([]);

    return Promise.all(rooms.map(room => {
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

      return post('FindItem', soapBody)
        .then(body => parseXml('FindItem', body))
        .then(normalizeAppointments)
        .then(appointments => fillRoomData(room, appointments))
        .catch(error => fillRoomData(room, [], { errorMessage: error.message }));
    })).then(updatedRooms => updatedRooms.sort((a, b) =>
      a.Name.toLowerCase().localeCompare(b.Name.toLowerCase())
    ));
  }

  function fillRoomData(room, appointments = [], options = {}) {
    room.Appointments = appointments.map((appointment, index) => {
      const start = appointment.Start;
      const end = appointment.End;
      const isPrivate = appointment.Sensitivity !== 'Normal';

      if (index === 0) {
        room.Busy = start < Date.now() && Date.now() < end;
      }

      return {
        Subject: isPrivate ? 'Private' : appointment.Subject,
        Organizer: appointment.Organizer,
        Start: start,
        End: end,
        Private: isPrivate
      };
    });

    if (options.errorMessage) room.ErrorMessage = options.errorMessage;
    return room;
  }

  function isRoomInBlacklist(email) {
    return roomBlacklist.some(blocked =>
      email.toLowerCase().includes(blocked.toLowerCase())
    );
  }

  return function getRooms(callback) {
    getListOfRooms()
      .then(getRoomsInLists)
      .then(getAppointmentsForRooms)
      .then(rooms => {
        try {
          roomStateWriter.update(rooms);
        } catch (error) {
          logger.error(`LED state update failed: ${error.message}`);
        }

        callback(null, rooms);
      })
      .catch(error => {
        logger.error(`EWS room retrieval failed during ${error.operation || 'unknown operation'}: ${error.message}`);
        callback(error);
      });
  };
}

const getRooms = createRoomsService();

module.exports = getRooms;
module.exports.createRoomsService = createRoomsService;
module.exports.createEwsError = createEwsError;
