# Fidelio Platform
This is a plugin for [RFLink](http://www.nemcon.nl/blog2/) integration in [Homebridge](https://github.com/nfarina/homebridge).

## Install
To install globally:
```
sudo npm install -g https://github.com/mlaurijsse/homebridge-rflink
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
                    "type": "Lightbulb",
                    "name": "Bedroom"
                  }
                ]
              },
              {
                "name": "Smartwaves",
                "protocol": "NewKaku",
                "address": "0202a000",
                "channels": [
                  {
                    "channel": 2,
                    "type": "Lightbulb",
                    "name": "Kitchen",
                    "dimrange": 15
                  },
                  {
                    "channel": 3,
                    "type": "Lightbulb",
                    "name": "Nightstand",
                    "dimrange": 15
                  },
                  {
                    "channel": 4,
                    "type": "StatelessProgrammableSwitch",
                    "name": "Trigger"
                  },
                  {
                    "channel": 5,
                    "type": "StatefulProgrammableSwitch",
                    "name": "Switch setting"
                  }
                ]
              }
            ],
            "delay": 100,
            "repeat":  0
          }
        ]
    }

  ]


```

## Supported types
Different types of devices are supported:
* Lightbulb: The device is a lightbulb in Homekit. The RF communication is bi-directional. Homekit can be used to switch the light on or off. The (power) status of the bulb is updated in Homekit after the remote is pressed.
* Switch: The device is a power switch in Homekit. The RF communication is bi-directional.
* StatefulProgrammableSwitch: The device is a read-only on-off type switch in Homekit. The RF communication is receive only, so state can not be changed using Homekit. This way, the RF remote could be used to trigger Homekit scenes, using Homekit automation.
* StatelessProgrammableSwitch: The device is a read-only 'pushbutton' type switch.

## Optional parameters
By adding `dimrange` to a channel, the brightness characteristic will be enabled for this device. The value of `dimrange` should correspond to 100% brightness level.

`delay` sets the delay used between commands to avoid flooding RFLink.

`repeat` sets the number of time a command is resent to RFLink. In some setups (e.g. NewKaku dimmers), this might yield undesired results. 
