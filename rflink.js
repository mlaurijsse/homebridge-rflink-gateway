const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline');
const mqttClient = require('mqtt');
const Promise = require('bluebird');
var debug = process.env.hasOwnProperty('RFLINK_DEBUG') ? consoleDebug : function () {
};


const     DEFAULT_COMMAND_DELAY = 0,
          DEFAULT_COMMAND_REPEAT = 0,
          DEFAULT_DEVICE = '/dev/tty.usbmodemFA131',
          DEFAULT_BAUDRATE = 57600,
          DEFAULT_MQTTHOST = 'mqtt.local',
          DEFAULT_MQTTTOPIC = 'RFLink/msg';

//
// Local helper functions
//


function consoleDebug() {
    console.log.apply(this, arguments);
}

function settlePromise(aPromise) {
    return aPromise.reflect();
}

function settlePromises(promisesArray) {
    return Promise.all(promisesArray.map(function(promise) {
        return promise.reflect();
    }));
}

//
// Class RFLinkController
//

/**
 *
 * @param options
 * @constructor
 */
var RFLinkController = function (options, callback) {
    debug('options', options);
    options = options || {};

    this.mqttHost = options.mqttHost;
    this.mqttTopic = options.mqttTopic || DEFAULT_MQTTTOPIC;
    this.device = options.device || DEFAULT_DEVICE;
    this._baudrate = options.baudrate || DEFAULT_BAUDRATE;
    this._delayBetweenCommands = options.delayBetweenCommands || DEFAULT_COMMAND_DELAY;
    this._commandRepeat = options.commandRepeat || DEFAULT_COMMAND_REPEAT;
    this._serialInit = Promise.resolve();
    if (this.mqttHost) {
      this._mqttInit = Promise.resolve();
      this._lastRequest = this._createMqtt();
    } else {
      this._serialInit = Promise.resolve();
      this._lastRequest = this._createSerial();
    }
    this._sendRequest = Promise.resolve();
    this._dataHandler = callback;
    debug("RFLink:" + JSON.stringify({
        dev: this.device,
        baudrate: this._baudrate,
        delayBetweenCommands: this._delayBetweenCommands,
        commandRepeat: this._commandRepeat,
        mqttHost: this.mqttHost,
        mqttTopic: this.mqttTopic
    }));
};

//
// Private member functions
//

RFLinkController.prototype._createSerial = function () {
    var self = this;

    return settlePromise(self._serialInit).then(function () {

        return (self._serialInit = new Promise(function (resolve, reject) {
            if (self.serial) {
                return resolve();
            }
            else {
                debug("Initializing SerialPort");

                try {
                  var serial = new SerialPort(self.device, {
                    baudRate: self._baudrate,
                    autoOpen: true
                  }, function (error) {
                    if ( error ) {
                      debug('RFLink: SerialPort failed to open: ' + error.message);
                      return reject(error);
                    } else {
                      var readline = serial.pipe(new Readline({ delimiter: '\r\n' }));
                      readline.on('data', function(data) {
                        debug('RFLink Data: ' + data);
                        self._dataHandler(data);
                      });
                      self.serial = serial;
                      debug('RFLink: SerialPort opened');
                      return resolve();
                    }
                  });
                } catch (err) {
                  debug('RFLink: SerialPort constructor error: ' + err.message);
                  return reject(err);
                }
            }
        }));
    });
};


RFLinkController.prototype._sendCommand = function (command) {

  var buffer = new Buffer.from(command,'ascii');
  self = this;

  return (self._sendRequest = settlePromise(self._sendRequest).then(function () {

    return new Promise(function (resolve, reject) {
      self._createSerial().then(function () {
        self.serial.write(buffer, function () {
          self.serial.drain(function (err) {
            if (err) {
              debug("RFLink: SerialPort.write error:" + err);
              return reject(err);
            }
            else {
              debug('RFLink: SerialPort.write success; buffer=[' + buffer + ']');
              return Promise.delay(self._delayBetweenCommands).then(function () {
                return resolve();
              });
            }
          });

        });
      }).catch(function (error) {
        return reject(error);
      });
    });
  }));
};

//
// Public member functions
//

/**
 *
 * @param varArgArray
 * @returns {*}
 */
RFLinkController.prototype.sendCommands = function (varArgArray) {
    var stackedCommands = [],
        varArgs = arguments,
        self = this;

        return (self._lastRequest = settlePromise(self._lastRequest).then(function () {

          for (var r = 0; r <= self._commandRepeat; r++) {
            for (var i = 0; i < varArgs.length; i++) {
              var arg = varArgs[i];
              if (((arg.length) > 0) && (arg[0] instanceof Array)) {
                for (var j = 0; j < arg.length; j++) {
                  stackedCommands.push(self._sendCommand(arg[j]));
                }
              }
              else {
                stackedCommands.push(self._sendCommand(arg));
              }

            }
          }
          return settlePromises(stackedCommands);
        }));
};


/**
 *
 * @param ms
 * @returns {*}
 */
RFLinkController.prototype.pause = function (ms) {
    var self = this;
    ms = ms || 100;

    return (self._lastRequest = settlePromise(self._lastRequest).then(function () {
        return Promise.delay(ms);
    }));
};


/**
 *
 * @returns {*}
 */
RFLinkController.prototype.close = function () {
    var self = this;

    return (self._lastRequest = settlePromise(self._lastRequest).then(function () {
        if (self.serial) {
            self.serial.close(function () {
              delete self.serial;
              return Promise.resolve();
            });
        } else {
          return Promise.resolve();
        }
    }));
};

// Inital support for https://github.com/couin3/RFLink, temperature and humidty sensors only

RFLinkController.prototype._createMqtt = function () {
  var self = this;

  return settlePromise(self._mqttInit).then(function () {

      return (self._mqttInit = new Promise(function (resolve, reject) {
          if (self.mqtt) {
              return resolve();
          }
          else {
              debug("RFLink: Initializing MQTT Connection to \'mqtt://%s\'", self.mqttHost);
              var options = {
                username: self.mqttUsername || "",
                password: self.mqttPassword || ""
              }
              self.mqtt = mqttClient.connect('mqtt://' + self.mqttHost, options);
              self.mqtt.on('connect', function() {
                debug('RFLink: MQTT connected, subscribing to topic \'%s\'', self.mqttTopic);
                self.mqtt.subscribe(self.mqttTopic);
              });
              self.mqtt.on('message', (topic, message) => {
                debug("\nRFLink: MQTT Data Topic %s -> %s", topic, message.toString());
                self._dataHandler(message.toString());
              });
     
          }
      }));
  });
};

module.exports = RFLinkController;