# MeetEasier

Because why pay money for something you can do yourself?

## Description

MeetEasier is a web application that visualizes meeting room availability. It works using Exchange Web Services (EWS) with Exchange room lists.

![Mockup 1](mockups/mockup-1.jpg)

***

## License

MeetEasier is licensed under the open source [GNU General Public License (GPL 3.0)](https://github.com/danxfisher/MeetEasier/blob/master/LICENSE).

In the event of wanting to commercially distribute a closed source modification of this code, please contact [danxfisher](https://github.com/danxfisher).

***

## Updates

This fork includes the following changes compared to the original project:

* Switched EWS authentication from Basic Auth to NTLM (`httpntlm`).
* Auth configuration now uses `EXCHANGE_*` environment variables (optionally via `.env`).
* Added optional LED status output, mirrored to a JSON file for external hardware.

***

## Assumptions

This application assumes you have:

* Exchange (Online or on-prem) with EWS and room lists enabled
* Conference room mailboxes organized in room lists
* Exchange Web Services (EWS) enabled
* A service account with access to all conference room mailboxes and EWS
* A web server with Node.js installed to run the application

**Please Note:** This application uses NTLM authentication for EWS. Use HTTPS and restrict the service account to the minimum required permissions.

***

## Installation

1. *Optional*: Install IISNode
    * I've also included a `web.config` file for an IIS install
2. In root directory, open a terminal or cmd:
    ```
    $ npm install
    ```
3. In the root directory, open a terminal or cmd:
    ```
    $ npm run build
    ```
4. In the root directory, open a terminal or cmd:
    ```
    $ npm start
    ```
5. If you want to start the react development server, in the root directory run:
    ```
    $ npm start-ui-dev
    ```

***

## Root Folder Structure Explained

* `app/` : Routes for EWS APIs
* `app/ews/` : All EWS functionality
* `config/` : All server side configuration settings
* `scss/` : All styles
* `static/` : All global static files
* `ui-react/` : Front end React routes and components

***

## React /src Folder Structure Explained

There are three main directories in the `ui-react/src/` folder:

* `components/` : Components separated in folders by function
* `config/` : Customizable config file (see defails below in Customization section)
* `layouts/` : Layout components for the two different layouts used.

### Components

* `flightboard/` : All components related to the flightboard or "all meeting" layout
* `global` : Components that will be used by both layouts
* `single-room` : All components related to the Single Room layout

#### components/flightboard/

* `Board` : Actual flightboard component itself
* `Clock` : Clock component for the upper right hand of the display
* `Navbar` : Top navigation/title bar piece
* `RoomFilter` : Room list filter in the navbar

#### components/global/

* `NotFound` : A "not found" page if an error or "404" occurs
* `Socket` : A service component to run the web socket connection for updating the flightboard and single room display

#### components/single-room/

* `Clock` : Clock component for the upper right hand of the display
* `Display` : All other features of the single room display

### Config

* `flightboard.config.js` : Simple customization config explained in the Customization section

### Layouts

* `flightboard/` : Layout for flightboard display
* `single-room/` : Layout for single room display

***

## Customization

### Simple

* `/config/auth.js` reads credentials from environment variables (or a local `.env` file):

    ```javascript
    module.exports = {
      // this user MUST have full access to all the room accounts
      exchange: {
        username: process.env.EXCHANGE_USER,
        password: process.env.EXCHANGE_PASS,
        domain: process.env.EXCHANGE_DOMAIN,
        uri: process.env.EXCHANGE_URL,
        maildomain: process.env.EXCHANGE_MAIL_DOMAIN
      }
    };
    ```

* Example environment variables:

    ```bash
    export EXCHANGE_USER=svcacct_email@domain.com
    export EXCHANGE_PASS=password
    export EXCHANGE_DOMAIN=domain
    export EXCHANGE_URL=https://outlook.office365.com/EWS/Exchange.asmx
    export EXCHANGE_MAIL_DOMAIN=domain.com
    export DISPLAY_ROOM_ALIAS=room-alias
    export LED_STATE_FILE=/run/room-led/state.json
    ```

* In `/config/room-blacklist.js`, add any room email to exclude it from the list of rooms:

    ```javascript
      module.exports = [
        'ROOM_EMAIL@DOMAIN.com'
      ];
    ```

* In `/ui-react/src/config/flightboard.config.js`, manage your customizations:

    ```javascript
    module.exports = {
      'board' : {
        'nextUp' : 'Next Up',
        'statusAvailable' : 'Open',
        'statusBusy' : 'Busy',
        'statusError' : 'Error'
      },

      'navbar' : {
        'title' : 'Conference Room Availability',
      },

      'roomFilter' : {
        'filterTitle' : 'Locations',
        'filterAllTitle' : 'All Conference Rooms',
      },
    };
    ```

* Upload your logo to `/static/img/logo.png`

### Advanced

* All EWS functionality is located in `app/ews`.
* To change the interval in which the web socket emits, edit the interval time in `app/socket-controller.js`.  By default, it is set to 1 minute.
* To update styles, make sure you install grunt first with `npm install -g grunt-cli`.  Then run `grunt` in the root directory to watch for SCSS changes.  Use the `.scss` files located in the `/scss` folder.
  * All React components can be locally styled by adding a new `.css` file and importing it into the component itself if you'd prefer to do it that way.
* Optional LED status output: the backend can mirror the current room status to a JSON file for external hardware (e.g., LEDs).
  * Configure `DISPLAY_ROOM_ALIAS` to match the room alias used by the app, and `LED_STATE_FILE` to control the output path (default: `/run/room-led/state.json`).
  * The file is only written when the status changes and contains `{ roomAlias, busy, error, ts }`. Writes are best-effort; errors are ignored.
***

## Flightboard Layout Mockup

![Mockup 3](mockups/mockup-3.jpg)

## Single Room Layout Mockup

![Mockup 2](mockups/mockup-2.jpg)

***

## Resources & Attributions

* [ews-javascript-api](https://github.com/gautamsi/ews-javascript-api)
* Mockup Images:
  * https://www.anthonyboyd.graphics/mockups/2017/realistic-ipad-pro-mockup-vol-3/
  * https://www.freepik.com/free-psd/business-meeting-with-tv-mockup_1163371.htm
  * https://www.freepik.com/free-psd/samsung-tv-mockup_800771.htm
