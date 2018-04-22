#!/usr/bin/env node

const ipc = require('node-ipc');
const mkdirp = require('mkdirp');
const LOG_PATH = "/var/log/onenode";
mkdirp.sync(LOG_PATH);
const path = require('path');


if(process.argv.length >= 3){
  if(process.argv[2] == "start_daemon"){
      // TODO: check if it's up
      const fs = require('fs');
      const { spawn } = require('child_process');
      const out = fs.openSync(path.join(LOG_PATH, 'daemon.out.log'), 'a');
      const err = fs.openSync(path.join(LOG_PATH, 'daemon.err.log'), 'a');

      const subprocess = spawn('node', [path.join(__dirname, '../daemon/index.js')], {
        detached: true,
        stdio: [ 'ignore', out, err ]
      });

      subprocess.unref();
  }
  else{
    ipc.config.id    = 'onenoded_caller';
    ipc.config.retry = 1500;
    ipc.connectTo('onenoded', function(){
      ipc.of.onenoded.on('connect', function(){
        console.log("connected");
        switch(process.argv[2]){
          case 'start_proc': case 'stop_proc':
            ipc.of.onenoded.emit(process.argv[2], path.resolve(process.argv[3]));
            break;
          case 'stop_daemon':
            ipc.of.onenoded.emit(process.argv[2]);
            break;
          default:
            console.log("Invalid command " + process.argv[2]);
            break;
        }
        ipc.disconnect('onenoded');
        console.log("disconnected");
      });
    });
  }
}
