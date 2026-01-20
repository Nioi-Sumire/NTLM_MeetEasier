const httpntlm = require('httpntlm');
const xml2js = require('xml2js');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/**
 * Liest die in Exchange definierten RoomLists und gibt sie als Array zurück.
 * Voraussetzungen:
 * - gültiger Exchange-Benutzer mit NTLM
 * - erreichbare Exchange-EWS-URL
 *
 * @param {function} callback (err, roomLists)
 */
module.exports = function (callback) {
  const auth = require('../../config/auth.js');
  const username = auth.exchange.username;
  const domain = auth.exchange.domain;
  const password = auth.exchange.password;
  const url = auth.exchange.uri;

  // SOAP-Request für GetRoomLists
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
    url: url,
    username: username,
    password: password,
    domain: domain,
    workstation: '',
    headers: { 'Content-Type': 'text/xml' },
    body: soapBody
  }, (err, res) => {
    if (err) {
      return callback(new Error('NTLM Request fehlgeschlagen: ' + err.message), null);
    }

    if (res.statusCode !== 200) {
      return callback(new Error('EWS antwortete mit HTTP ' + res.statusCode), null);
    }

    xml2js.parseString(res.body, { explicitArray: false }, (parseErr, result) => {
      if (parseErr) {
        return callback(new Error('Fehler beim XML-Parsing: ' + parseErr.message), null);
      }

      try {
        // Robuste Navigation durch die verschachtelte Antwortstruktur
        const responseMessages = result?.['s:Envelope']?.['s:Body']?.['m:GetRoomListsResponse']?.['m:ResponseMessages'];
        const message = responseMessages?.['m:GetRoomListsResponseMessage'];
        const roomListsContainer = message?.['m:RoomLists']?.['t:Address'];

        let roomLists = [];

        // Antwort kann ein Array oder ein einzelnes Element enthalten
        if (Array.isArray(roomListsContainer)) {
          roomLists = roomListsContainer.map(item => ({
            Name: item?.['t:Name'] || '(Unbenannt)',
            Address: item?.['_'] || item
          }));
        } else if (roomListsContainer) {
          roomLists.push({
            Name: roomListsContainer?.['t:Name'] || '(Unbenannt)',
            Address: roomListsContainer?.['_'] || roomListsContainer
          });
        }

        return callback(null, roomLists);
      } catch (e) {
        // Fallback bei unerwartetem Antwortschema
        return callback(new Error('Antwort konnte nicht ausgewertet werden: ' + e.message), null);
      }
    });
  });
};
