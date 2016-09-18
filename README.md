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
""platforms": [
    {
        "platform":"RFLink",
        "name":"RFLink Light Control",
        "bridges": [
          {
            "serialport": "/dev/tty.usbmodemFA131",
            "devices": [
              {
                "name": "Living Room",
                "type": "lightbulb",
                "protocol": "AB400D",
                "address": "00004d",
                "channel": 1
              },
              {
                "name": "Hallway",
                "type": "switch",
                "protocol": "AB400D",
                "address": "00004d",
                "channel": 2
              }
            ],
            "repeat": 1,
            "delay": 0
          }
        ]
    }
]


```
