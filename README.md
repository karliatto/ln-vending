# ln-vending

This project aims to collect set of documentation and software to integrate Bitcoin Lightning Network payments in a vending machine using MDB protocol.

## Initial configuration
- https://docs.qibixx.com/mdb-products/mdb-pi-hat-vmc-firststeps

## Connecting the jumpers to work as MDB peripheral
- https://docs.qibixx.com/mdb-products/mdb-pi-hat-connectors-jumpers
Making a vending machine with MDB protocol accept LN payments

## Communication with `minicom`

- Find the device `ls /dev/ttyACM*`

- Then use it to start minicom:

```bash
sudo minicom -D /dev/ttyACM0 -b 115200
```

Then you have to activate the local echo on minicom settings: CTRL+A+Z to see the commands you are sending.

And once the connection has been established you can use [api-cashless-slave](https://docs.qibixx.com/mdb-products/api-cashless-slave) to communicate with the machine.

