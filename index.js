var inherits = require('util').inherits;
var RFLink = require('./rflink');
var Service, Characteristic;
var debug = process.env.hasOwnProperty('RFLINK_DEBUG') ? consoleDebug : function() {};

function consoleDebug() {
  console.log.apply(this, arguments);
}

var CustomCharacteristic;
var FakeGatoHistoryService;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  CustomCharacteristic = require('./lib/CustomCharacteristic.js')(homebridge);
  FakeGatoHistoryService = require('fakegato-history')(homebridge);
  homebridge.registerPlatform("homebridge-rflink-gateway", "RFLink", RFLinkPlatform);
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
        if (!!this.config.bridges[i]) {
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
      commandRepeat: bridgeConfig.repeat || false,
      mqttHost: bridgeConfig.mqttHost || false,
      mqttTopic: bridgeConfig.mqttTopic || false
    },
    this._dataHandler.bind(this));

  // Create accessories for all of the defined devices
  for (var i = 0; i < devicesLength; i++) {
    if (!!bridgeConfig.devices[i]) {
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

    var found = false;
    this._devices.forEach(function(device) {
      if (device.parsePacket(packet))
        found = true;
    });
    if (!found) {
      this.log.warn('WARNING: Message from an unknown device protocol: \'%s\',  address: \'%s\'.', packet.protocol, packet.address);
    }
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
  this.channels.forEach(function(chn) {
    var channel;
    if (chn.hasOwnProperty('channel')) {
      channel = chn;
    } else {
      channel = {
        channel: chn
      };
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

    var service = new Service[channel.type](channel.name, i);
    service.channel = channel.channel;
    service.type = channel.type;
    service.name = channel.name;
    service.device = this;
    service.lastCommand = '';
    service.parsePacket = this.parsePacket[channel.type];
    service.setBatteryStatus = this.setBatteryStatus;
    service.serviceWatchdog = this.serviceWatchdog;
    service.notResponding = this.notResponding;
    service.watchdog = config.watchdog || 60;
    service.timeout = this.serviceWatchdog.call(service);
    service.log = this.log;

    // Burr winter is here
    if (service.type === 'TemperatureSensor') {
      service.getCharacteristic(Characteristic.CurrentTemperature)
        .setProps({
          minValue: -100,
          maxValue: 100
        });

      if (channel.history) {
        service.loggingService = new FakeGatoHistoryService("weather", service, {
          storage: 'fs',
          minutes: (channel.historyInterval ? channel.historyInterval : 10) // Update history every 10 minutes
        });
        this.services.push(service.loggingService);
      }

      if (channel.alarmOver || channel.alarmOver === 0) { // Cludge for 0 being false
        service.alarmOver = channel.alarmOver;
        service.alarmOverService = new Service.ContactSensor(channel.name + 'Alarm Over', 'over');
        this.services.push(service.alarmOverService);
        this.log("Added alarm over: %s, protocol: %s, address: %s, channels: %d", this.name, this.protocol, this.address, this.channels.length, service.alarmOver);
      }
      if (channel.alarmUnder || channel.alarmUnder === 0) {
        service.alarmUnder = channel.alarmUnder;
        service.alarmUnderService = new Service.ContactSensor(channel.name + 'Alarm Under', 'under');
        this.services.push(service.alarmUnderService);
        this.log("Added alarm under: %s, protocol: %s, address: %s, channels: %d", this.name, this.protocol, this.address, this.channels.length, service.alarmUnder);
      }
    }

    // if channel is of writable type
    if (service.type === 'Lightbulb' || service.type === 'Switch') {
      service.getCharacteristic(Characteristic.On).on('set', this.setOn.bind(service));
    }

    // Add brightness Characteristic if dimrange option is set
    if (channel.dimrange) {
      service.addCharacteristic(new Characteristic.Brightness())
        .on('set', this.setBrightness.bind(service));
      service.dimrange = channel.dimrange;
    }

    // if channel is of writable type
    if (service.type === 'MotionSensor') {
      if (channel.history) {
        service.loggingService = new FakeGatoHistoryService("motion", service, {
          storage: 'fs',
          minutes: (channel.historyInterval ? channel.historyInterval : 10) // Update history every 10 minutes
        });
        this.services.push(service.loggingService);
        service.addCharacteristic(CustomCharacteristic.LastActivation);
      }
    }

    // add to services stack
    this.services.push(service);
    i++;
  }.bind(this));

  // Set device information
  var os = require("os");
  var hostname = os.hostname();
  
  this.informationService = new Service.AccessoryInformation();
  this.informationService
    .setCharacteristic(Characteristic.Manufacturer, "RFLink")
    .setCharacteristic(Characteristic.Model, this.protocol)
    .setCharacteristic(Characteristic.SerialNumber, hostname + "-" + this.address)
    .setCharacteristic(Characteristic.FirmwareRevision, require('./package.json').version);
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
        (on ? ";ON;\n" : ";OFF;\n");

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
        this.channel + (on ? ";ON;\n" : ";OFF;\n");
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
    this.services.forEach(function(service) {
      if (service.parsePacket)
        service.parsePacket(packet);
    });
    return true;
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

RFLinkAccessory.prototype.parsePacket.Lightbulb = function(packet) {
  if ((this.channel == "none") || (packet.channel == this.channel)) {
    this.timeout = this.serviceWatchdog();
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
  if ((this.channel == "none") || (packet.channel == this.channel)) {
    this.timeout = this.serviceWatchdog();
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
  if ((this.channel == "none") || (packet.channel == this.channel)) {
    this.timeout = this.serviceWatchdog();
    debug("%s: Matched address: %s, channel: %s, command: %s", this.type, packet.address, packet.channel, packet.command);
    if (packet.command == 'ON') {
      this.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS, false, 'RFLink');
    } else if (packet.command == 'OFF') {
      this.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(Characteristic.ProgrammableSwitchEvent.DOUBLE_PRESS, false, 'RFLink');
    }
  } else if (this.channel == "all") {
    if (packet.command == 'ALLON') {
      debug("%s: Matched channel: all, command: %s", this.type, packet.command);
      this.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS, false, 'RFLink');
    } else if (packet.command == 'ALLOFF') {
      debug("%s: Matched channel: all, command: %s", this.type, packet.command);
      this.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(Characteristic.ProgrammableSwitchEvent.DOUBLE_PRESS, false, 'RFLink');
    }
  }
};

// 20;40;Skylink;ID=3c7d;SWITCH=01;CMD=ON;

RFLinkAccessory.prototype.parsePacket.MotionSensor = function(packet) {
  if ((this.channel === "none") || (packet.channel === this.channel)) {
    this.timeout = this.serviceWatchdog();
    debug("%s: Matched address: %s, channel: %s, command: %s", this.type, packet.address, packet.channel, packet.command);
    if (packet.command === 'ON') {
      this.getCharacteristic(Characteristic.MotionDetected).setValue(true, false, 'RFLink');

      // Reset motion sensor after 30 seconds from last activation

      if (this.motionTimeout) {
        clearTimeout(this.motionTimeout);
      }
      this.motionTimeout = setTimeout(function() {
        this.getCharacteristic(Characteristic.MotionDetected).setValue(false, false, 'RFLink');
        this.loggingService.addEntry({
          time: Math.round(new Date().valueOf() / 1000),
          status: this.getCharacteristic(Characteristic.MotionDetected).value
        });
      }.bind(this), 0.5 * 60 * 1000);
    } else if (packet.command === 'OFF') {
      this.getCharacteristic(Characteristic.MotionDetected).setValue(false, false, 'RFLink');
    }

    // Historical data graphing

    if (this.loggingService) {
      this.loggingService.addEntry({
        time: Math.round(new Date().valueOf() / 1000),
        status: this.getCharacteristic(Characteristic.MotionDetected).value
      });
      if (packet.command === 'ON') {
        this.getCharacteristic(CustomCharacteristic.LastActivation)
          .updateValue(Math.round(new Date().valueOf() / 1000) - this.loggingService.getInitialTime());
      }
    }
  }
};

RFLinkAccessory.prototype.parsePacket.TemperatureSensor = function(packet) {
  if (packet.data && packet.data.TEMP) {
    // debug('This', this);
    this.timeout = this.serviceWatchdog();
    debug("%s: Matched sensor: %s, address: %s, data: %o", this.name, packet.protocol, packet.address, packet.data);
    var temp = signedToFloat(packet.data.TEMP);
    debug("%s: Setting temperature to %s", this.name, temp);
    this.getCharacteristic(Characteristic.CurrentTemperature).setValue(temp);

    // Historical data graphing

    if (this.loggingService) {
      var entry = {
        time: Math.round(new Date().valueOf() / 1000),
        temp: roundInt(temp)
      };
      // debug("THIS", this.device.services[0].constructor.name);
      var humidity = this.device.services.find(element => element.constructor.name === 'HumiditySensor');
      if (humidity) {
        entry.humidity = humidity.getCharacteristic(Characteristic.CurrentRelativeHumidity).value;
      }
      this.loggingService.addEntry(entry);
    }

    // Trigger contract sensor if temperature is over alarmOver

    if (this.alarmOver || this.alarmOver === 0) {
      // debug('alarmOver %s > %s', temp, this.alarmOver);
      if (temp > this.alarmOver) {
        this.alarmOverService.getCharacteristic(Characteristic.ContactSensorState).setValue(Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
        this.log.warn('ALARM: %s Temperature exceeded %s > %s', this.displayName, temp, this.alarmOver);
      } else {
        this.alarmOverService.getCharacteristic(Characteristic.ContactSensorState).setValue(Characteristic.ContactSensorState.CONTACT_DETECTED);
      }
    }

    // Trigger contract sensor if temperature is below alarmUnder

    if (this.alarmUnder || this.alarmUnder === 0) {
      // debug('alarmUnder %s < %s', temp, this.alarmUnder);
      if (temp < this.alarmUnder) {
        this.alarmUnderService.getCharacteristic(Characteristic.ContactSensorState).setValue(Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
        this.log.warn('ALARM: %s Temperature below %s < %s', this.displayName, temp, this.alarmUnder);
      } else {
        this.alarmUnderService.getCharacteristic(Characteristic.ContactSensorState).setValue(Characteristic.ContactSensorState.CONTACT_DETECTED);
      }
    }
  }

  this.setBatteryStatus(packet);
};

RFLinkAccessory.prototype.parsePacket.HumiditySensor = function(packet) {
  if (packet.data && packet.data.HUM) {
    this.timeout = this.serviceWatchdog();
    debug("%s: Matched sensor: %s, address: %s, data: %o", this.name, packet.protocol, packet.address, packet.data);
    var humidity = parseInt(packet.data.HUM, 10);
    debug("%s: Setting humidity to %s", this.name, humidity);
    this.getCharacteristic(Characteristic.CurrentRelativeHumidity).setValue(humidity);
  }

  this.setBatteryStatus(packet);
};

// Reset watchdog every time a message appears

RFLinkAccessory.prototype.serviceWatchdog = function() {
  if (this.timeout) {
    clearTimeout(this.timeout);
    // debug('Resetting serviceWatchdog:', this.displayName, this.watchdog);
  } else {
    debug('Setting serviceWatchdog:', this.displayName, this.watchdog);
  }

  this.timeout = setTimeout(this.notResponding.bind(this), this.watchdog * 60 * 1000);
  return (this.timeout);
};

// Mark non responding devices

RFLinkAccessory.prototype.notResponding = function() {
  this.log.error('ERROR: Device %s %s is not responding:', this.displayName, this.type);

  // Updating the primary characteristic to an error type will mark it as 'Not Responding' in the home app.
  // To clear the 'Not responding' the characteristic needs to be updated with a valid value.

  switch (this.type) {
    case 'TemperatureSensor':
      this.getCharacteristic(Characteristic.CurrentTemperature).updateValue(new Error('Device not responding.'));
      break;
    case 'MotionSensor':
      this.getCharacteristic(Characteristic.MotionDetected).updateValue(new Error('Device not responding.'));
      break;
    case 'HumiditySensor':
      this.getCharacteristic(Characteristic.CurrentRelativeHumidity).updateValue(new Error('Device not responding.'));
      break;
    case 'Lightbulb':
    case 'Switch':
      this.getCharacteristic(Characteristic.On).updateValue(new Error('Device not responding.'));
      break;
    case 'StatelessProgrammableSwitch':
      this.getCharacteristic(Characteristic.ProgrammableSwitchEvent).updateValue(new Error('Device not responding.'));
      break;
    default:
      debug('ERROR: %s is not responding and type %s is not known', this.displayName, this.type);
  }
};

function roundInt(string) {
  return Math.round(parseFloat(string) * 10) / 10;
}
