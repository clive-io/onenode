/*
Transparent, in-process multi-server manager.

Requirements to run a server:
- package.json includes a "main", which when included will start up the server listen() immediately (i.e. not async)
- don't mess with globals => could be solved with vm/vm2?
- don't mess with process.exit or anything in process
- use process.env.PORT
- don't do persistent things like setInterval; the only persistent things you should do is spin up net Servers. Maybe more to come.
*/

/*
// require('coffee-register');
// have to modify HTTP to provide a map of procs to listening server(s)
//   and then take diff of that dict before and after requiring
// uh if you mock net does that change the behavior of http too?

repopaths.forEach(repopath => {
  // Also attach tags to output for statbot's sake
  // How do we kill the subserver without taking down the whole server?

});
*/

const http = require('http');
const path = require('path');
const ipc = require('node-ipc');
const net = require('net');
const child_process = require('child_process');
const require_reload = require('require-reload')(require);
const getPort = require('portfinder').getPortPromise;
const fs = require('fs');
//const vm2 = require('vm2');

ipc.config.id    = 'onenoded';
ipc.config.retry = 1500;

ipc.serve(function(){
  ipc.server.on('start', function(){
    console.log('started!');
  });

  ipc.server.on('start_proc', function(input_path){
    console.log("Starting " + input_path);
    getPort().then(port => {
      console.error("Got port", port);
      console.error("Setting currServer.");
      currServer = input_path.split('\\').pop().split('/').pop();
      let crashes = 0;
      process.env.PORT = port;
      while(crashes < 5){
        console.log("hi");
        try{
          let main_file = JSON.parse(fs.readFileSync(path.join(input_path, "package.json"))).main;
          // possibly require('require-reload').emptyCache(require)?
          require_reload(path.join(input_path, main_file));
          console.error(input_path + " appears to have started successfully.");
          currServer = null;
          return;
        }catch(e){
          crashes ++;
          console.error(input_path + " crashed while starting! Retrying.");
          console.error(e);
        }
      }
      console.error(input_path + " crashed too many times. Giving up.");
      currServer = null;
    });
  });

  ipc.server.on('stop_proc', function(inputpath){
    let servername = inputpath.split('\\').pop().split('/').pop();
    for(let server of servers[servername])
      server.close();
  });

  ipc.server.on('stop_daemon', function(){
    console.log("Stopping...")
    for(let servername in servers)
      for(let server of servers[servername])
        server.close();
    ipc.server.stop();
    console.log("Should be stopped now.");
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
      console.error("called listen(", ...args, ")");
    }
    return this._original_listen(...args);
  };
});
ipc.server.start();

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at:', p, 'reason:', reason);
  // application specific logging, throwing an error, or other logic here
});

//console.log(process._getActiveRequests().length);
//console.log(process._getActiveHandles().length);
