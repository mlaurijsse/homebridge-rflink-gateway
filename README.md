# RFLink Platform
This is a plugin for [RFLink](http://www.nemcon.nl/blog2/) integration in [Homebridge](https://github.com/nfarina/homebridge).

## Features include

- Support for Lightbulb, Switch, StatelessProgrammableSwitch, Temperature, Humidity and Motion Sensors
- Temperature Alerts for over or under temperature conditions
- Historical data logging for Temperature, Humidity and Motion sensors.  Data is visible within iOS apps supporting historical graphs.
- Support for serially and mqtt connected RFLink devices.
- Watch dog support for devices not updating within a defined time period and devices will be marked as not responding

## MQTT RFLink Devices

Initial support for mqtt connected RFLINK devices based on https://github.com/couin3/RFLink.  At the present time only read only sensor devices are supported.  Tested and validated devices include Temperature, Motion and Humidity Sensors.

## Install
To install globally:
```
sudo npm install -g https://github.com/mlaurijsse/homebridge-rflink-gateway
```

## Config
Example config.json:

```
"platforms": [
    {
        "platform":"RFLink",
        "name":"RFLink test Platform",
        "bridges": [
          {
            "serialport": "/dev/tty.usbmodemFD121",
            "devices": [
              {
                "name": "ELRO",
                "protocol": "AB400D",
                "address": "4a",
                "watchdog": 5,
                "channels": [
                  {
                    "channel": 1,
                    "type": "Lightbulb",
                    "name": "Desk"
                  },
                  {
                    "channel": 2,
                    "type": "Switch",
                    "name": "TV"
                  },
                  {
                    "channel": 3,
                    "type": "Switch",
                    "name": "Radio"
                  },
                  {
                    "channel": 4,
                    "type": "StatelessProgrammableSwitch",
                    "name": "Button"
                  }
                ]
              },
              {
                "name": "Remote",
                "protocol": "NewKaku",
                "address": "0202a000",
                "type": "StatelessProgrammableSwitch"
                "channels": [ 1, 2, 3, 4, "all"]
              },
              {
                "name": "Oregon sensor",
                "protocol": "Oregon TempHygro",
                "address": "CC1D",
                "channels": [
                  {
                    "channel": "TEMP",
                    "type": "TemperatureSensor",
                    "name": "Test temperature",
                    "alarmOver": 35,
                    "history": true
                  },
                  {
                    "channel": "HUM",
                    "type": "HumiditySensor",
                    "name": "Test humidity"
                  }
                ]
              }
            ],
            "delay": 500,
            "repeat":  0
          }
        ]
    }

  ]


```

## Supported types
Different types of devices are supported:
* Lightbulb: The device is a lightbulb in HomeKit. The RF communication is bi-directional. HomeKit can be used to switch the light on or off. The (power) status of the bulb is updated in HomeKit after the remote is pressed.
* Switch: The device is a power switch in HomeKit. The RF communication is bi-directional.
* StatelessProgrammableSwitch: The device is a read-only 'pushbutton' type switch. Parses `CMD=ON` as `Single Press` event, and `CMD=OFF` as `Double Press` event.
* TemperatureSensor: A read-only device that supplies the current temperature
* HumiditySensor:  A read-only device that supplies the current relative humidity
* MotionSensor: A read-only device that detects motion

### Deprecated types

* StatefulProgrammableSwitch (Deprecated): The device is a read-only on-off type switch in HomeKit. The RF communication is receive only, so state can not be changed using HomeKit. This way, the RF remote could be used to trigger HomeKit scenes, using HomeKit automation.

## Optional parameters
By adding `dimrange` to a channel, the brightness characteristic will be enabled for this device. The value of `dimrange` should correspond to 100% brightness level.

`delay` sets the delay used between commands to avoid flooding RFLink.

`repeat` sets the number of time a command is resent to RFLink. In some setups (e.g. NewKaku dimmers), this might yield undesired results.

`watchdog` Watchdog timer in minutes for devices not responding.  If a device is not heard from it will be marked as 'Unavailable' in the home app. Defaults to 60 minutes.

`history` Enables historical value graphing with iOS apps supporting historical graphing.  Only supported for Temperature, Humidity and Motion devices.

`mqttHost` name or ip address of your mqtt host.  Required to enable mqtt device mode.

`mqttTopic` Optional topic for mqtt messages from your rflink device, defaults to `RFLink/msg`

### Optional parameters for Temperature Sensors

`alarmOver`: Optional, Create a fake contact sensor called name + Over Alarm.  Value is temperature in Celsius that if exceeded will trigger the contact sensor.

`alarmUnder`: Optional, Create a fake contact sensor called name + Under Alarm.  Value is temperature in Celsius that if dropped below will trigger the contact sensor.

## Credits

* NortherMan54 - Support for mqtt based RFLink devices, ie https://github.com/couin3/RFLink, Motion Sensors, temperature alarms and historical graphing.
* matiaskorhonen - Added initial support for sensors
