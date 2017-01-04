var SerialPort = require("serialport").SerialPort;
var Promise = require('bluebird');
var debug = process.env.hasOwnProperty('RFLINK_DEBUG') ? consoleDebug : function () {
};


const     DEFAULT_COMMAND_DELAY = 0,
          DEFAULT_COMMAND_REPEAT = 0,
          DEFAULT_DEVICE = '/dev/tty.usbmodemFA131',
          DEFAULT_BAUDRATE = 57600;

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
    options = options || {};

    this.device = options.device || DEFAULT_DEVICE;
    this._baudrate = options.baudrate || DEFAULT_BAUDRATE;
    this._delayBetweenCommands = options.delayBetweenCommands || DEFAULT_COMMAND_DELAY;
    this._commandRepeat = options.commandRepeat || DEFAULT_COMMAND_REPEAT;
    this._serialInit = Promise.resolve();
    this._lastRequest = this._createSerial();
    this._sendRequest = Promise.resolve();
    this._dataHandler = callback;
    debug("RFLink:" + JSON.stringify({
        dev: this.device,
        baudrate: this._baudrate,
        delayBetweenCommands: this._delayBetweenCommands,
        commandRepeat: this._commandRepeat
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
                    baudrate: self._baudrate,
                    autoOpen: true,
                    parser: SerialPort.parsers.readline('\r\n')
                  }, function (error) {
                    if ( error ) {
                      debug('RFLink: SerialPort failed to open: ' + error.message);
                      return reject(error);
                    } else {
                      self.serial = serial;
                      self.serial.on('data', function(data) {
                        debug('RFLink Data: ' + data);
                        self._dataHandler(data);
                      });
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

  var buffer = new Buffer(command,'ascii');
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


module.exports = RFLinkController;
