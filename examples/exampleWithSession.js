"use strict";

const Webserver = require('./webserver.js');
const Rpc = require('simple-json-rpc');
const SessionManager = require('simple-session');

var sessionManager = new SessionManager({
    timeout: 3600
});

var rpc = new Rpc({
    strict: true,
    auth: sessionManager,
    identity: "Example"
});

var webserver = new Webserver({
    port: 8080,
    host: '0.0.0.0',
    application: rpc
});

console.log("Example is running.");
