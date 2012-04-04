#!/usr/bin/env node

var
temp = require('temp'),
child_process = require('child_process'),
forever = require('forever'),
path = require('path'),
fs = require('fs');

function checkErr(msg, err) {
  if (err) {
    process.stderr.write("ERROR: " + msg + ":\n\n");
    process.stderr.write(err + "\n");
    process.exit(1);
  }
}

// first, parse appconfig (~/config.json) and make it available to the rest of this file:
var appconfig;
try {
  appconfig = JSON.parse(fs.readFileSync(path.join(process.env['HOME'], 'config.json')));
  [ 'public_url' ].forEach(function(required_key) {
    if (!appconfig[required_key]) throw "missing '"+ required_key +"' property";
  });
} catch(e) {
  console.log("!! invalid config.json:", e.toString());
  process.exit(1);
}
console.log("application config:", appconfig);

// create a temporary directory where we'll stage new code
temp.mkdir('deploy', function(err, newCodeDir) {
  console.log(">> staging code to", newCodeDir);

  var commands = [
    [ "exporting current code", "git archive --format=tar master | tar -x -C " + newCodeDir ],
    [ "extract current sha", "git log -1 --oneline master > $HOME/ver.txt" ],
    [ "update dependencies", "npm install --production", {
      cwd: newCodeDir,
      env: {
        HOME: process.env['HOME'],
        PATH: process.env['PATH']
      }
    } ]
  ];

  function runNextCommand(cb) {
    if (!commands.length) return cb();
    var cmd = commands.shift();
    console.log(">>", cmd[0]);
    child_process.exec(cmd[1], cmd[2] ? cmd[2] : {}, function(err, se, so) {
      console.log(so,se);
      checkErr("while " + cmd[0], err);
      runNextCommand(cb);
    });
  }

  runNextCommand(function() {
    // once all commands are run, we'll start servers with forever
    forever.list(false, function(err, l) {
      checkErr("while listing processes", err);
      if (!l || !l.length) return moveCode()
      else {
        var sa = forever.stopAll();
        console.log(">> stopping running servers");
        sa.on('stopAll', function() {
          moveCode();
        });
      }
    });
  });

  const codeDir = path.join(process.env['HOME'], 'code');

  function moveCode() {
    commands.push([ 'delete ancient code', 'rm -rf ' + codeDir + '.old' ]);
    if (path.existsSync(codeDir)) {
      commands.push([ 'move old code out of the way', 'mv ' + codeDir + '{,.old}' ]);
    }
    commands.push([ 'move new code into place', 'mv ' + newCodeDir + ' ' + codeDir ]);

    runNextCommand(function() {
      startServers();
    });
  }

  // now start all servers
  function startServers() {
    var servers;
    try {
      var config = JSON.parse(fs.readFileSync(path.join(codeDir, '.awsbox.json')));
      if (!config.processes) throw "missing 'processes' property";
      servers = config.processes;
    } catch(e) {
      console.log("!! Couldn't read .awsbox.json: " + e.toString());
      process.exit(1);
    }

    function startNextServer(cb) {
      if (!servers.length) return cb();
      var script = servers.shift();
      var cmd = path.join(codeDir, script);
      var logfilePath = path.join(process.env['HOME'], 'var', 'log', path.basename(script) + '.log');
      console.log(">> " + script + " logs at " + logfilePath);
      commands.push([ 'start ' + script, 'forever -a -l ' + logfilePath + ' start ' + cmd]);
      runNextCommand(function(err) {
        delete process.env['PORT'];
        startNextServer(cb);
      });
    }

    // XXX: for now we start the first process with a "well known" port, all others with
    // whatever port they default to.
    process.env['PORT'] = 10000;

    // make public_url available to all processes
    process.env['PUBLIC_URL'] = appconfig.public_url;

    // start all servers
    startNextServer(function(err) {
      console.log('>> all done');
    });
  }
});