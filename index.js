var inherits = require('util').inherits;
var SerialPort = require("serialport");
var RFLink = require('./rflink');
var Service, Characteristic;
var debug = process.env.hasOwnProperty('RFLINK_DEBUG') ? consoleDebug : function () {};

function consoleDebug() {
      console.log.apply(this, arguments);
}


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

function signedToFloat(hex) {
  var int = parseInt(hex, 16);
  if ((int & 0x8000) > 0) {
    return -(int & 0x7FFF) / 10;
  } else {
    return int / 10;
  }
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
      if (dev) {
        devices.push(dev);
      }
    }
  }
  this._devices = devices;
  return devices;
};

RFLinkPlatform.prototype._dataHandler = function(data) {
  data = data.split(';');

  if (data.length > 5) {

    var packetType = data[0];
    var packetCounter = data[1];
    var deviceName = data[2];
    var dataFields = data.slice(3, data.length - 1);

    dataFields = dataFields.reduce(function(accumulator, value) {
      var splitData = value.split('=');
      accumulator[splitData[0]] = splitData[1];
      return accumulator;
    }, {});

    var packet = {
      type: packetType,
      id: packetCounter,
      protocol: deviceName,
      address: dataFields.ID,
      channel: dataFields.SWITCH,
      command: dataFields.CMD,
      data: dataFields
    };

    this._devices.forEach(function (device) {
      device.parsePacket(packet);
    });
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
  this.protocol = config.protocol;
  this.address = config.address;
  this.channels = config.channels;
  this.dimrange = config.dimrange;
  this.services = Array();

  var i = 0;

  if (this.channels === undefined) {
    this.channels = ["none"];
  }

  // Add homekit service types
  this.channels.forEach(function (chn) {
    var channel;
    if (chn.hasOwnProperty('channel')) {
      channel = chn;
    } else {
      channel = { channel: chn };
    }

    if (channel.name === undefined) {
      channel.name = this.name + ' ' + channel.channel;
    }
    if (channel.type === undefined) {
      channel.type = this.type;
    }
    if (channel.dimrange === undefined) {
      channel.dimrange = this.dimrange;
    }


      service = new Service[channel.type](channel.name, i);
      service.channel = channel.channel;
      service.type = channel.type;
      service.name = channel.name;
      service.device = this;
      service.lastCommand = '';
      service.parsePacket = this.parsePacket[channel.type];
      service.setBatteryStatus = this.setBatteryStatus;

      // if channel is of writable type
      if (service.type == 'Lightbulb' || service.type == 'Switch') {
        service.getCharacteristic(Characteristic.On).on('set', this.setOn.bind(service));
      }

      // Add brightness Characteristic if dimrange option is set
      if (channel.dimrange) {
        service.addCharacteristic(new Characteristic.Brightness())
          .on('set', this.setBrightness.bind(service));
        service.dimrange = channel.dimrange;
      }

      // add to services stack
      this.services.push(service);
      i++;
  }.bind(this));


  // Set device information
  this.informationService = new Service.AccessoryInformation();
  this.informationService
    .setCharacteristic(Characteristic.Manufacturer, "RFLink")
    .setCharacteristic(Characteristic.Model, this.protocol);
//    .setCharacteristic(Characteristic.SoftwareRevision, require('./package.json').version)
//    .setCharacteristic(Characteristic.Version, require('./package.json').version);

  this.log("Added RFLink device: %s, protocol: %s, address: %s, channels: %d", this.name, this.protocol, this.address, this.channels.length);

}

RFLinkAccessory.prototype.getServices = function() {
  return this.services.concat(this.informationService);
};


RFLinkAccessory.prototype.setOn = function(on, callback, context) {
  var cmd, brightness;

  if (context !== 'RFLink') {
    if (this.device.protocol == "KNX") {
      cmd = '10;' +
          this.device.protocol + ';' +
          this.device.address +
          (on?";ON;\n":";OFF;\n");

    // if uses a dimrange, turn device on by setting brightness
  } else if (on && this.dimrange && ((brightness = this.getCharacteristic(Characteristic.Brightness).value) > 0)) {
      brightness = Math.round(brightness * this.dimrange / 100);
      cmd = '10;' +
          this.device.protocol + ';' +
          this.device.address + ';' +
          this.channel + ';' +
          brightness + ';\n';

    } else {
      cmd = '10;' +
          this.device.protocol + ';' +
          this.device.address + ';' +
          this.channel + (on?";ON;\n":";OFF;\n");
    }

    if (cmd != this.lastCommand) {
      this.device.controller.sendCommands(cmd);
      this.lastCommand = cmd;
      debug("Channel: %s, switched: %d, by command: %s", this.channel, on, cmd);
    }

  }

  return callback(null);
};

RFLinkAccessory.prototype.setBrightness = function(brightness, callback, context) {
  if (context !== 'RFLink') {
    var brightnessScaled = Math.round(brightness * this.dimrange / 100);
    var cmd = '10;' +
        this.device.protocol + ';' +
        this.device.address + ';' +
        this.channel + ';' +
        brightnessScaled + ';\n';

    if (cmd != this.lastCommand) {
        this.device.controller.sendCommands(cmd);
        this.lastCommand = cmd;
    }

    if (brightness === 0) {
      this.getCharacteristic(Characteristic.On).setValue(0, false, 'RFLink');
    } else {
      this.getCharacteristic(Characteristic.On).setValue(1, false, 'RFLink');
    }
    debug("Channel: %s, brightness: %d, by command: %s", this.channel, brightness, cmd);
  }
  return callback(null);
};

RFLinkAccessory.prototype.parsePacket = function(packet) {
  if (packet.protocol == this.protocol && packet.address == this.address) {
    this.services.forEach(function (service) {
      service.parsePacket(packet);
    });
  }
};

RFLinkAccessory.prototype.setBatteryStatus = function(packet) {
  if (packet.data && packet.data.BAT) {
    // A value of 0 indicates battery level is normal; a value of 1 indicates
    // that battery level is low.
    var batteryLevel = packet.data.BAT === "LOW" ? 1 : 0;
    debug("%s: Setting StatusLowBattery to %d", this.type, batteryLevel);
    this.getCharacteristic(Characteristic.StatusLowBattery).setValue(batteryLevel);
  }
};

RFLinkAccessory.prototype.parsePacket.Lightbulb = function (packet) {
  if((this.channel == "none") || (packet.channel == this.channel)) {
    debug("%s: Matched address: %s, channel: %s, command: %s", this.type, packet.address, packet.channel, packet.command);
    if (packet.command == 'ON') {
      this.getCharacteristic(Characteristic.On).setValue(1, false, 'RFLink');
    } else if (packet.command == 'OFF') {
      this.getCharacteristic(Characteristic.On).setValue(0, false, 'RFLink');
    }
  }
};

RFLinkAccessory.prototype.parsePacket.Switch = RFLinkAccessory.prototype.parsePacket.Lightbulb;

RFLinkAccessory.prototype.parsePacket.StatefulProgrammableSwitch = function(packet) {
  if((this.channel == "none") || (packet.channel == this.channel)) {
    debug("%s: Matched address: %s, channel: %s, command: %s", this.type, packet.address, packet.channel, packet.command);
    if (packet.command == 'ON') {
      this.getCharacteristic(Characteristic.ProgrammableSwitchOutputState).setValue(1, false, 'RFLink');
      this.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS, false, 'RFLink');
    } else if (packet.command == 'OFF') {
      this.getCharacteristic(Characteristic.ProgrammableSwitchOutputState).setValue(0, false, 'RFLink');
      this.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS, false, 'RFLink');
    }
  }
};

RFLinkAccessory.prototype.parsePacket.StatelessProgrammableSwitch = function(packet) {
  if((this.channel == "none") || (packet.channel == this.channel)) {
    debug("%s: Matched address: %s, channel: %s, command: %s", this.type, packet.address, packet.channel, packet.command);
      if (packet.command == 'ON'){
        this.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS, false, 'RFLink');
      } else if (packet.command == 'OFF') {
        this.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(Characteristic.ProgrammableSwitchEvent.DOUBLE_PRESS, false, 'RFLink');
      }
    } else if (this.channel == "all") {
      if (packet.command == 'ALLON'){
        debug("%s: Matched channel: all, command: %s", this.type, packet.command);
        this.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS, false, 'RFLink');
      } else if (packet.command == 'ALLOFF') {
        debug("%s: Matched channel: all, command: %s", this.type, packet.command);
        this.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(Characteristic.ProgrammableSwitchEvent.DOUBLE_PRESS, false, 'RFLink');
      }
    }
};

RFLinkAccessory.prototype.parsePacket.TemperatureSensor = function(packet) {
  if (packet.data && packet.data.TEMP) {
    debug("%s: Matched sensor: %s, address: %s, data: %o", this.type, packet.protocol, packet.address, packet.data);
    var temp = signedToFloat(packet.data.TEMP);
    this.getCharacteristic(Characteristic.CurrentTemperature).setValue(temp);
  }

  this.setBatteryStatus(packet);
};

RFLinkAccessory.prototype.parsePacket.HumiditySensor = function(packet) {
  if (packet.data && packet.data.HUM) {
    debug("%s: Matched sensor: %s, address: %s, data: %o", this.type, packet.protocol, packet.address, packet.data);
    var humidity = parseInt(packet.data.HUM, 10);
    this.getCharacteristic(Characteristic.CurrentRelativeHumidity).setValue(humidity);
  }

  this.setBatteryStatus(packet);
};
