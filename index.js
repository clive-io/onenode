#!/usr/bin/env node

/*
Transparent, in-process multi-server manager.

Requirements to run a server:
- package.json includes a "main", which when included will start up the server listen() immediately (i.e. not async)
- don't mess with globals => could be solved with vm/vm2?
*/

/*
// require('coffee-register');
// have to modify HTTP to provide a map of procs to listening server(s)
//   and then take diff of that dict before and after requiring
// uh if you mock net does that change the behavior of http too?

repopaths.forEach(repopath => {
  // Also attach tags to output for statbot's sake
  // How do we kill the subserver without taking down the whole server?

  let crashes = 0;
  while(crashes < 5){
    process.env.PORT = ...
    try{
      require(JSON.parse(fs.readFileSync(repopath + "package.json")).main)
    }catch(e){
      crashes ++;
      console.error(repopath + "Crashed!")
    }
    
  }
});
*/

const http = require('http');
const path = require('path');
const ipc = require('node-ipc');
const net = require('net');
const child_process = require('child_process');
const require_reload = require('require-reload')(require);
//const vm2 = require('vm2');

//TODO: put daemon into daemon.js, and then use child_process for that

function start_daemon(){
  ipc.config.id    = 'procservd';
  ipc.config.retry = 1500;

  ipc.serve(function(){
    ipc.server.on('start', function(){
      console.log('started!');
    });

    ipc.server.on('start_proc', function(inputpath){
      currServer = inputpath.split('\\').pop().split('/').pop();
      // possibly require('require-reload').emptyCache(require)?
      require_reload(path.join(inputpath,require(path.join(inputpath, "package.json")).main));
      currServer = null;
    });

    ipc.server.on('stop_proc', function(inputpath){
      let servername = inputpath.split('\\').pop().split('/').pop();
      for(let server of servers[servername])
        server.close();
    });

    ipc.server.on('stop_daemon', function(){
      for(let servername in servers)
        for(let server of servers[servername])
          server.close();
      ipc.server.stop();
    });

    if(net.Server.prototype._original_listen !== undefined)
      throw new Error("???");
    net.Server.prototype._original_listen = net.Server.prototype.listen
    let servers = new Set();
    let currServer = null;
    net.Server.prototype.listen = function(...args){
      if(currServer !== null){
        if(!servers[currServer])
          servers[currServer] = [];
        servers[currServer].push(this);
      } else {
        console.error("Unexpected server-listen detected. Maybe you're starting up the server asynchronously?");
      }
      return this._original_listen(...args);
    };
  });
  ipc.server.start();
}

function call_daemon(){
  ipc.config.id    = 'procservd_caller';
  ipc.config.retry = 1500;
  ipc.connectTo('procservd', function(){
    switch(process.argv[2]){
      case 'start_proc':
      case 'stop_proc':
        ipc.of.procservd.emit(process.argv[2], path.resolve(process.argv[3]));
        break;
      case "start_daemon":
        const fs = require('fs');
        const { spawn } = require('child_process');
        const out = fs.openSync('./out.log', 'a');
        const err = fs.openSync('./out.log', 'a');

        const subprocess = spawn('node', [process.argv[1], "start_daemon_spawned"], {
          detached: true,
          stdio: [ 'ignore', out, err ]
        });

        subprocess.unref();
        break;
      case 'stop_daemon':
        ipc.of.procservd.emit(process.argv[2]);
        break;
      default:
        console.log("Invalid command " + process.argv[2]);
        break;
    }
    ipc.disconnect('procservd');
  });
}


if(process.argv.length >= 3){
  switch(process.argv[2]){
    case "start_daemon_spawned":
      start_daemon();
      break;
    case "start_proc": case "stop_proc": case "start_daemon": case "stop_daemon":
      call_daemon();
      break
    default:
      console.log("Invalid command " + process.argv[2]);
      break;
  }
}

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at:', p, 'reason:', reason);
  // application specific logging, throwing an error, or other logic here
});

//console.log(process._getActiveRequests().length);
//console.log(process._getActiveHandles().length);
