// server.js

// set up ======================================================================
var express = require('express');
var app = express();

// configuration ===============================================================
// use public folder for js, css, imgs, etc
app.use(express.static(`${__dirname}/ui-react/build`));
app.use(express.static('static'));

// routes ======================================================================
require('./app/routes.js')(app);

// launch ======================================================================
const port = process.env.PORT || 8080;

// fallback: return index.html for all unmatched routes (React SPA)
app.get('*', (req, res) => {
  res.sendFile(`${__dirname}/ui-react/build/index.html`);
});

var theserver = app.listen(port, function(){
	// call controller functions -------------------------------------------------
	var io = require('socket.io').listen(theserver);

	// controller if using room lists
	var controller = require('./app/socket-controller.js')(io);

	// log something so we know the server is working correctly
	console.log(`now we're cooking.`);
});
