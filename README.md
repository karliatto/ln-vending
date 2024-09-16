# ln-vending

This project aims to collect set of documentation and software to integrate Bitcoin Lightning Network payments in a vending machine using MDB protocol.

![img](./assets/bitcoin-ln-vending.png)

## Development

### Prerequisities

- [NVM](https://github.com/nvm-sh/nvm)
- [NodeJS](https://nodejs.org/en/download/package-manager)

### Getting started

- `git clone git@github.com:karliatto/ln-vending.git`
- `nvm install`
- `npm i`
- `sudo chown ${USER}:${USER} /dev/ttyAMA0`
- `npm run connect`
  Then you should be able to send text commands by typing and pressing enter.

## Initial configuration

- https://docs.qibixx.com/mdb-products/mdb-pi-hat-vmc-firststeps

## Connecting the jumpers to work as MDB peripheral

- https://docs.qibixx.com/mdb-products/mdb-pi-hat-connectors-jumpers
  Making a vending machine with MDB protocol accept LN payments

## Communication with `minicom`

- Find the device `ls /dev/ttyACM*`

- Then use it to start minicom:

```bash
sudo minicom -D /dev/ttyAMA0 -b 115200
```

Then you have to activate the local echo on minicom settings: CTRL+A+Z to see the commands you are sending.

And once the connection has been established you can use [api-cashless-slave](https://docs.qibixx.com/mdb-products/api-cashless-slave) to communicate with the machine.

## Virtual device for testing

You can create a virtual device using `socat` like:

```bash
$ socat -d -d pty,raw,echo=0 pty,raw,echo=0
2024/09/15 14:16:28 socat[35355] N PTY is /dev/pts/4
2024/09/15 14:16:28 socat[35355] N PTY is /dev/pts/5
2024/09/15 14:16:28 socat[35355] N starting data transfer loop with FDs [5,5] and [7,7]
```

Depending on the response you have to connect to device `/dev/pts/4` and send messages to `/dev/pts/5` like:

```bash
$ echo "c,STATUS,VEND,99.20,18" > /dev/pts/5
```
