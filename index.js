var inherits = require('util').inherits;
var SerialPort = require("serialport").SerialPort;
var RFLink = require('./rflink');
var Service, Characteristic;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerPlatform("homebridge-rflink", "RFLink", RFLinkPlatform);
};

//
// RFLink Platform
//
function RFLinkPlatform(log, config) {
  this.log = log;
  this.config = config;
}

RFLinkPlatform.prototype.accessories = function(callback) {
  var foundDevices = [];

  if (this.config.bridges) {

    var bridgesLength = this.config.bridges.length;

    if (bridgesLength === 0) {
      this.log("ERROR: No bridges found in configuration.");
      return;
    } else {
      for (var i = 0; i < bridgesLength; i++) {
        if ( !! this.config.bridges[i]) {
          returnedDevices = this._addDevices(this.config.bridges[i]);
          foundDevices.push.apply(foundDevices, returnedDevices);
          returnedDevices = null;
        }
      }
    }
  } else {
    this.log("ERROR: Could not read any bridges from configuration.");
    return;
  }

  if (foundDevices.length > 0) {
    callback(foundDevices);
  } else {
    this.log("ERROR: Unable to find any valid devices.");
    return;
  }
};

RFLinkPlatform.prototype._addDevices = function(bridgeConfig) {
  var devices = [];
  var devicesLength = 0;
  // Various error checking
  if (!bridgeConfig.devices || (devicesLength = bridgeConfig.devices.length) === 0) {
    this.log("ERROR: Could not read devices from configuration.");
    return;
  }

  // Initialize a new controller to be used for all zones defined for this bridge
  // We interface the bridge directly via serial port
  bridgeController = new RFLink({
    device: bridgeConfig.serialport || false,
    baudrate: bridgeConfig.baudrate || false,
    delayBetweenCommands: bridgeConfig.delay || false,
    commandRepeat: bridgeConfig.repeat || false
  },
  this._dataHandler.bind(this));

  // Create accessories for all of the defined devices
  for (var i = 0; i < devicesLength; i++) {
    if ( !! bridgeConfig.devices[i]) {
      dev = new RFLinkAccessory(this.log, bridgeConfig.devices[i], bridgeController);
      devices.push(dev);
    }
  }
  this._devices = devices;
  return devices;
};

RFLinkPlatform.prototype._dataHandler = function(data) {
  data = data.split(';');

  data[3] = (data[3]!==undefined)?data[3].split('=').pop():null;
  data[3] = data[3].length < 6 ? "0".repeat(6-data[3].length) + data[3] : data[3];
  data[4] = (data[4]!==undefined)?data[4].split('=').pop():null;

  var packet = {
    type: data[0],
    id: data[1],
    protocol: data[2],
    address: data[3],
    channel: data[4],
    command: data[5]
  };
  var dev = this._devices.find(function(element){
    return (packet.protocol == element.rflink[0] && packet.address == element.rflink[1] && packet.channel == element.rflink[2]);
  });
  if (dev) {
    dev.parseCommand(packet.command);
  }
};

//
// RFLink Accessory
//
function RFLinkAccessory(log, config, controller) {
  this.log = log;
  this.config = config;
  this.controller = controller;
  this.name = config.name;
  this.type = config.type;
  this.rflink = [
    config.protocol,
    config.address,
    config.channel];

  // Set device information
  this.informationService = new Service.AccessoryInformation();
  this.informationService
    .setCharacteristic(Characteristic.Manufacturer, "RFLink")
    .setCharacteristic(Characteristic.Model, this.protocol);

  // Add homekit Switch service
  if (this.type == 'lightbulb') {
    this.service = new Service.Lightbulb(this.name);
  } else {
    this.service = new Service.Switch(this.name);
  }

  this.service
  .getCharacteristic(Characteristic.On)
  .on('set', this.setOn.bind(this));

  this.log("Added RFLink device: %s, type: %s, protocol: %s, address: %#08x, channel: %d", this.name, this.type, this.protocol, this.address, this.channel);

}

RFLinkAccessory.prototype.getServices = function() {
  return [this.informationService, this.service];
};


RFLinkAccessory.prototype.setOn = function(on, callback, context) {

  if (context !== 'RFLink') {
    var cmd = '10;' + this.rflink.join(';') + (on?";ON;\n":";OFF;\n");
    this.controller.sendCommands(cmd);
    this.log("Device: %s, switched: %d, by command: %s", this.name, on, cmd);
  }

  return callback(null);
};

RFLinkAccessory.prototype.parseCommand = function(command) {
    if (command == 'CMD=ON') {
      this.service.getCharacteristic(Characteristic.On).setValue(1, false, 'RFLink');
    } else if (command == 'CMD=OFF') {
      this.service.getCharacteristic(Characteristic.On).setValue(0, false, 'RFLink');
    }

};
