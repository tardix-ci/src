/**
 * TARDIX ci / helper
 *
 * Written by Jared Allard <rainbowdashdc@pony.so>
 **/

// requires
var Gitter = require('node-gitter'),
    gh     = require('githubhook'),
    fs     = require('fs'),
    path   = require('path'),
    color  = require('colors'),
    moment = require('moment-timezone'),
    jsdom  = require('jsdom'),
    spawn  = require('child_process').spawn;

var bot = JSON.parse(fs.readFileSync("./config.json", {encoding:'utf8'}));
_out("init", "config loaded.");

// constructors
var gitter = new Gitter(bot.gitterToken);

// stuff
var rooms = [];

// start time in ms
var startTime = new Date();

/* logging to gitter and stdout */
function _log(room, msg) {
  room.send(msg);
  console.log("on "+room.name+": " + msg);
}

function _out(prefix, msg) {
  console.log(color.cyan(prefix)+":", color.white(msg));
}

function _broadcast(msg) {
  _out("gitter", "on all: "+msg);
  rooms.forEach(function(v, i) {
    gitter.client.post("/rooms" + '/' + v.id + '/chatMessages', {body: {text: msg}});
  });
}

function _slog(room, msg) {
  _out("gitter", "on "+room.name+": " + msg);
  gitter.client.post("/rooms" + '/' + room.id + '/chatMessages', {body: {text: msg}});
}

function _reply(room, message, msg) {
  _log(room, "@"+message.fromUser.username+" "+msg);
}

/* takes table */
function _writeToDB(data) {
  fs.writeFileSync("./db.json", JSON.stringify(data), {encoding: 'utf8'});
}

function _loadDB() {
  return JSON.parse(fs.readFileSync('./db.json', {encoding:'utf8'}));
}

if(fs.existsSync("./db.json") === false) {
  var db = {
    values: {},
    authorized: ['RainbowDashDC', 'DemHydraz', 'bhodgins'],
    agenda: [],
    agendaNext: undefined
  };

  console.log("regenerating database.");

  _writeToDB(db);
}

function doScreencloud(room, message, url) {
  _out("screencloud", "communicating with screencloud.net");
  jsdom.env({
    url: url,
    scripts: ["http://code.jquery.com/jquery.js"],
    done: function(errors,window) {
      var $ = window.$;
      _out("screencloud", "finished");
      _reply(room, message, "![img](https:"+$("#content .screenshot a").attr("href")+")");
    }
  });
}


/* handler */
function handler(room, message) {
  try {
    _out("gitter", "["+room.name+"] new message: "+message.text);

  // check if it's our message
  var spl = message.text.match(/([^\s]+)/g);

  // image uploading module thing....
  if(Object.prototype.toString.call(spl[0].match(/http:\/\/screencloud.net\/v\//g)) === '[object Array]' ) {
    doScreencloud(room, message, spl[0]);
  }

  // if statements ahoy
  if (spl[0] !== bot.name) {
    return;
  }

  // get the user and etc
  var db = _loadDB(),
      user = message.fromUser.username;

  // check permissions
  if (db.authorized.indexOf(user) === -1) {
    _reply(room, message, "Sorry, I cannot take commands from you.");
    return;
  }

  // check the spl (split)
  if(spl[1] === "ping") {
    if(spl[2] !== undefined) {
      _reply(room, {fromUser:{username:spl[2].replace("@", "")}}, "pong");
    } else {
      _reply(room, message, "pong");
    }
  } else if(spl[1] === "get") {
    if(spl[2] === "bot-version") {
      _reply(room, message, bot.version);
    } else {
      if(typeof(spl[2]) === "undefined") {
        _reply(room, message, "you forgot to give me a key.");
        return;
      }

      _reply(room, message, db.values[spl[2]]);
    }
  } else if(spl[1] === "set") {
    if(typeof(spl[3]) === "undefined") {
      _reply(room, message, "you forgot to tell me a value.");
      return;
    }

    // strip the overhead
    var f;
    f = message.text.replace(spl[0], "");
    f = f.replace(spl[1], "");
    f = f.replace(spl[2], "");

    db.values[spl[2]] = f;
    _writeToDB(db);
  } else if(spl[1] === "agenda") {
    if(spl[2] === "get") {
      var header = "\n**Agenda**: \n",
          footer = "",
          o = "";

      db.agenda.forEach(function(v){
        console.log("entry: "+v);
        if(v!==undefined) {
          o = o+" * "+v+"\n";
        }
      });

      _reply(room, message, header+o+footer);
    } else if (spl[2] === "add") {
      // strip the overhead
      var n;
      n = message.text.replace(spl[0], "");
      n = n.replace(spl[1], "");
      n = n.replace(spl[2], "");

      db.agenda.push(n+" - @"+user);
      _writeToDB(db);

      _reply(room, message, "Added!");
    } else if (spl[2] === "clear") {
      db.agenda = [];
      _writeToDB(db);
    } else if(spl[2] === "set-time") {
      if(typeof(spl[3]) === "undefined") {
        _reply(room, message, "You forgot a date!");
        return;
      }

      // combine the dates
      var time,
          match;
      time = spl[3]+" "+spl[4];
      match = time.match(/[0-9,\-]{10} [0-2]{2}:[0-6]{2}/g);

      if(Object.prototype.toString.call(match) !== '[object Array]') {
        _reply(room, message, "Invalid date, use MM-DD-YYYY HH:mm");
        return;
      }

      if(spl[5] !== undefined) {
        console.log("converting tz");
        if(spl[5].toLowerCase()==="pst") {
          // something to convert to UTC
          time = moment(time, "MM-DD-YYYY HH:mm").tz("UTC").format("MM-DD-YYYY HH:mm");
        }
      }

      gitter.client.request("PUT", "/rooms/"+room.id, {body: {topic: "Next Meeting: "+time}});

      db.agendaNext = time;
      _writeToDB(db);
    } else if(spl[2] === "next") {
      _reply(room, message, moment(db.agendaNext, "MM-DD-YYYY HH:mm").fromNow()+" ("+db.agendaNext+" UTC)");
    } else {
      _reply(room, message, "Sorry, I didn't recognize that.");
    }
  } else if(spl[1] === "bad") {
    _reply(room, message, "I'm sorry... I tried my best :(");
  } else if(spl[1] === "screencloud") {
    doScreencloud(room, message, spl[2]);
  } else {
    _reply(room, message, "I'm sorry, I didn't recognize that command.");
  }
} catch(err) {
  console.log(err);
}
}

function doTests(_cb) {
  var tests = spawn("lua", ["TestRunner.lua"], {
    cwd: "kernel/"
  });

  /*tests.stdout.on('data', function (data) {
    console.log('stdout: ' + data);
  });

  tests.stderr.on('data', function (data) {
    console.log('stderr: ' + data);
  });*/

  if (_cb === undefined) {
    _cb = function(msg) {
      _broadcast(msg);
    };
  }

  tests.on("close", function(code) {
    _out("testrunner", "exit code "+code);
    if (code === 1) {
      _cb("[["+bot.gitHub+"]("+bot.repo+")] ("+bot.branch+") Some tests have failed.");
    } else {
      _cb("[["+bot.gitHub+"]("+bot.repo+")] ("+bot.branch+") All tests succedded.");
    }
  });
}

function initGitter() {
  gitter.rooms.join('RainbowDashDC/tardix-ci')
  .then(function(room) {
    _out("gitter", 'joined room: '+room.name);

    /* compute intialization time */
    var t = new Date() - startTime;

    // append to rooms array
    rooms.push(room);

    var events = room.listen();

    events.on('message', function(message) {
      handler(room, message);
    });

    gitter.rooms.join('TARDIX/Dev')
    .then(function(room) {
      _out("gitter", 'joined room: '+room.name);

      // append to rooms array
      rooms.push(room);

      var events = room.listen();

      events.on('message', function(message) {
        handler(room, message);
      });

      _out("gitter", "listening for messages on "+rooms.length+" room(s)");

      doTests(function() {
        _slog(rooms[0], "initialized in "+t+"ms.");
      });
    });
  });
}

/* setup the build enviroments */
_out("init", "setting up build enviroment");

if(fs.existsSync("kernel") === false) {
  console.log("starting git clone of '"+bot.repo+"'");
  var _gc = spawn("git", ["clone", bot.repo, "kernel"], {cwd:"."});
  _gc.on('close', function(code) {
    _out("init", "[git] (clone) exited with code "+code);

    var _gc2 = spawn("git", ["checkout", bot.branch], {cwd:"kernel"});
    _gc2.on('close', function() {
      _out("init", "[git] (checkout) checked out branch "+bot.branch);

      initGitter();
    });
  });
} else {
  // some other async thing.
  _out("init", "kernel exists.");
  _out("init", "attempting a git pull");
  var _gp = spawn("git", ["pull"], {cwd:"kernel"});

  _gp.on("close", function(code) {
    _out("init", "[git] (pull) exited with code "+code);

    gitter.currentUser()
    .then(function(user) {
      _out("gitter", 'logged in as: '+user.username);
      initGitter();
    });

  });
}

/* Init Listener */
var github = gh({/* options */});

github.listen();

github.on('*', function (event, repo, ref, data) {
  _slog(rooms[0], "received a webhook event.");

  var jsn = data;

  if (jsn.head_commit === null) {
    return;
  }

  console.log("commit: "+jsn.head_commit.id.substring(0,10));
  console.log("pusher: "+jsn.pusher.name);

  var _gp = spawn("git", ["pull"], {cwd:"kernel"});

  _gp.on("close", function(code) {
    _out("init", "[git] (pull) exited with code "+code);

    doTests(function(msg) {
      var id = rooms[1].id;
      msg = msg+" - @"+jsn.pusher.name;
      msg = msg.replace(/\([a-z]+\)/g, "(["+jsn.head_commit.id.substring(0,10)+"](https://github.com/TARDIX/kernel/commit/"+jsn.head_commit.id+"))");
      gitter.client.post("/rooms" + '/' + id + '/chatMessages', {body: {text: msg}});
    });
  });
});


/* handle control-C interupt */
process.on('SIGINT', function() {
  _out("main", "Control-C handled. Shutting down.");
  process.exit();
});
