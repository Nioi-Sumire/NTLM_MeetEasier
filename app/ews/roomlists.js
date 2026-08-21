const xml2js = require('xml2js');
const ewsClient = require('./client.js');

/**
 * Liest die im Exchange angelegten RoomLists aus und gibt sie als Array zurück.
 * Erwartet:
 * - gültigen Exchange-User mit NTLM
 * - funktionierende Exchange-EWS-URL
 *
 * @param {function} callback (err, roomLists)
 */
module.exports = function (callback) {
  // SOAP Body für GetRoomLists
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

  // NTLM Request an Exchange
  ewsClient.post('GetRoomLists', soapBody, (err, res) => {
    if (err) {
      return callback(new Error('NTLM Request fehlgeschlagen: ' + err.message), null);
    }

    if (res.statusCode !== 200) {
      return callback(new Error('EWS antwortete mit HTTP ' + res.statusCode), null);
    }

    // XML parsen
    xml2js.parseString(res.body, { explicitArray: false }, (parseErr, result) => {
      if (parseErr) {
        return callback(new Error('Fehler beim XML-Parsing: ' + parseErr.message), null);
      }

      try {
        // Vorsichtig durch die verschachtelte Antwort navigieren
        const responseMessages = result?.['s:Envelope']?.['s:Body']?.['m:GetRoomListsResponse']?.['m:ResponseMessages'];
        const message = responseMessages?.['m:GetRoomListsResponseMessage'];
        const roomListsContainer = message?.['m:RoomLists']?.['t:Address'];

        let roomLists = [];

        // Kann ein Array oder ein einzelnes Element sein
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

        // Erfolgreich: keine Fehler werfen, sondern Ergebnis zurückgeben
        return callback(null, roomLists);
      } catch (e) {
        // Falls sich das Schema stark unterscheidet
        return callback(new Error('Antwort konnte nicht ausgewertet werden: ' + e.message), null);
      }
    });
  });
};
