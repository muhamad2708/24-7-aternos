'use strict';

const mineflayer = require('mineflayer');
const { Movements, pathfinder, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const config = require('./settings.json');

const express = require('express');
const https = require('https');

const app = express();

const PORT = process.env.PORT || 5000;


/* =========================================================
   BOT STATE
========================================================= */

const botState = {
  connected: false,
  waitingForEmptyServer: false,
  lastActivity: null,
  reconnectAttempts: 0,
  startTime: Date.now(),
  errors: [],
  wasThrottled: false
};


/* =========================================================
   VARIABLES
========================================================= */

let bot = null;

let activeIntervals = [];

let reconnectTimeoutId = null;

let connectionTimeoutId = null;

let isReconnecting = false;


/* =========================================================
   EXPRESS DASHBOARD
========================================================= */

app.get('/', (req, res) => {

  res.send(`
<!DOCTYPE html>
<html lang="id">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>AFK Bot Dashboard</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 30px;
  background: #111;
  color: white;
  font-family: Arial, sans-serif;
}

.container {
  max-width: 900px;
  margin: auto;
}

h1 {
  margin-bottom: 25px;
}

.card {
  background: #1c1c1c;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 15px;
}

.label {
  color: #999;
  font-size: 14px;
  margin-bottom: 6px;
}

.value {
  font-size: 20px;
  font-weight: bold;
}

.online {
  color: #00ff88;
}

.offline {
  color: #ff5555;
}

.waiting {
  color: #ffaa00;
}

</style>

</head>

<body>

<div class="container">

<h1>🤖 AFK Bot Dashboard</h1>

<div class="card">

<div class="label">
Status
</div>

<div
  id="status"
  class="value"
>
Loading...
</div>

</div>


<div class="card">

<div class="label">
Server
</div>

<div
  id="server"
  class="value"
>
Loading...
</div>

</div>


<div class="card">

<div class="label">
Bot
</div>

<div
  id="bot"
  class="value"
>
Loading...
</div>

</div>


<div class="card">

<div class="label">
Player lain
</div>

<div
  id="players"
  class="value"
>
Loading...
</div>

</div>


<div class="card">

<div class="label">
Uptime
</div>

<div
  id="uptime"
  class="value"
>
Loading...
</div>

</div>


<div class="card">

<div class="label">
Reconnect Attempts
</div>

<div
  id="reconnect"
  class="value"
>
Loading...
</div>

</div>


<div class="card">

<div class="label">
Last Activity
</div>

<div
  id="activity"
  class="value"
>
Loading...
</div>

</div>


<div class="card">

<div class="label">
Errors
</div>

<pre
  id="errors"
>Loading...</pre>

</div>

</div>


<script>

async function updateStatus() {

  try {

    const response =
      await fetch('/health');

    const data =
      await response.json();


    const status =
      document.getElementById('status');

    const server =
      document.getElementById('server');

    const bot =
      document.getElementById('bot');

    const players =
      document.getElementById('players');

    const uptime =
      document.getElementById('uptime');

    const reconnect =
      document.getElementById('reconnect');

    const activity =
      document.getElementById('activity');

    const errors =
      document.getElementById('errors');


    if (data.connected) {

      status.textContent =
        '🟢 ONLINE';

      status.className =
        'value online';

    }

    else if (
      data.waitingForEmptyServer
    ) {

      status.textContent =
        '🟡 MENUNGGU SERVER KOSONG';

      status.className =
        'value waiting';

    }

    else {

      status.textContent =
        '🔴 OFFLINE';

      status.className =
        'value offline';

    }


    server.textContent =
      data.server || '-';

    bot.textContent =
      data.username || '-';

    players.textContent =
      data.players ?? 0;

    uptime.textContent =
      data.uptime || '-';

    reconnect.textContent =
      data.reconnectAttempts ?? 0;

    activity.textContent =
      data.lastActivity || '-';


    if (
      data.errors &&
      data.errors.length > 0
    ) {

      errors.textContent =
        data.errors.join('\\n');

    }

    else {

      errors.textContent =
        'Tidak ada error';

    }

  }

  catch (error) {

    console.error(error);

  }

}


updateStatus();

setInterval(
  updateStatus,
  5000
);

</script>

</body>

</html>
  `);

});


/* =========================================================
   TUTORIAL
========================================================= */

app.get('/tutorial', (req, res) => {

  res.send(`
<!DOCTYPE html>

<html lang="id">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>AFK Bot Tutorial</title>

<style>

body {
  background: #111;
  color: white;
  font-family: Arial, sans-serif;
  padding: 30px;
}

.container {
  max-width: 900px;
  margin: auto;
}

.card {
  background: #1c1c1c;
  padding: 20px;
  border-radius: 12px;
  margin-bottom: 15px;
}

</style>

</head>

<body>

<div class="container">

<h1>AFK Bot</h1>

<div class="card">

<h2>Server Empty Mode</h2>

<p>
Bot hanya akan mencoba masuk ketika server
tidak mempunyai player lain.
</p>

</div>

<div class="card">

<h2>Anti AFK</h2>

<p>
Bot melakukan beberapa aktivitas kecil agar
tidak mudah dianggap AFK.
</p>

</div>

<div class="card">

<h2>Auto Reconnect</h2>

<p>
Bot akan mencoba reconnect ketika disconnect.
</p>

</div>

</div>

</body>

</html>
  `);

});


/* =========================================================
   HEALTH
========================================================= */

app.get('/health', (req, res) => {

  const players =
    getOtherPlayers();

  res.json({

    connected:
      botState.connected,

    waitingForEmptyServer:
      botState.waitingForEmptyServer,

    username:
      config['bot-account'].username,

    server:
      `${config.server.ip}:${config.server.port}`,

    players:
      players.length,

    uptime:
      formatUptime(
        Date.now() -
        botState.startTime
      ),

    lastActivity:
      botState.lastActivity
        ? new Date(
            botState.lastActivity
          ).toISOString()
        : null,

    reconnectAttempts:
      botState.reconnectAttempts,

    errors:
      botState.errors,

    position:
      bot &&
      bot.entity
        ? {
            x: Math.round(
              bot.entity.position.x
            ),

            y: Math.round(
              bot.entity.position.y
            ),

            z: Math.round(
              bot.entity.position.z
            )
          }
        : null

  });

});


/* =========================================================
   PING
========================================================= */

app.get('/ping', (req, res) => {

  res.send('pong');

});


/* =========================================================
   START WEB SERVER
========================================================= */

const server =
  app.listen(
    PORT,
    () => {

      console.log(
        `[Web] Dashboard running on port ${PORT}`
      );

    }
  );


/* =========================================================
   FORMAT UPTIME
========================================================= */

function formatUptime(ms) {

  const totalSeconds =
    Math.floor(ms / 1000);

  const days =
    Math.floor(
      totalSeconds / 86400
    );

  const hours =
    Math.floor(
      (totalSeconds % 86400) / 3600
    );

  const minutes =
    Math.floor(
      (totalSeconds % 3600) / 60
    );

  const seconds =
    totalSeconds % 60;

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;

}


/* =========================================================
   ERROR LOG
========================================================= */

function addError(error) {

  const message =
    error?.message ||
    String(error);

  console.error(
    `[Error] ${message}`
  );

  botState.errors.push(
    `${new Date().toISOString()} - ${message}`
  );

  if (
    botState.errors.length > 20
  ) {

    botState.errors.shift();

  }

}


/* =========================================================
   CLEANUP
========================================================= */

function clearBotTimeouts() {

  if (connectionTimeoutId) {

    clearTimeout(
      connectionTimeoutId
    );

    connectionTimeoutId = null;

  }

}


function clearAllIntervals() {

  for (
    const interval of activeIntervals
  ) {

    clearInterval(
      interval
    );

  }

  activeIntervals = [];

}


function addInterval(
  callback,
  delay
) {

  const interval =
    setInterval(
      callback,
      delay
    );

  activeIntervals.push(
    interval
  );

  return interval;

}


/* =========================================================
   RECONNECT DELAY
========================================================= */

function getReconnectDelay() {

  const base =
    Number(
      config.utils?.[
        'auto-reconnect-delay'
      ]
    ) || 5000;

  const max =
    Number(
      config.utils?.[
        'max-reconnect-delay'
      ]
    ) || 30000;

  const attempts =
    botState.reconnectAttempts;

  const exponential =
    Math.min(
      base *
      Math.pow(
        2,
        attempts
      ),
      max
    );

  const jitter =
    Math.floor(
      Math.random() * 1000
    );

  return (
    exponential +
    jitter
  );

}


/* =========================================================
   SERVER EMPTY CONFIG
========================================================= */

function isServerEmptyModeEnabled() {

  return (
    config.utils?.[
      'server-empty-only'
    ]?.enabled === true
  );

}


function getServerEmptyCheckInterval() {

  return (
    Number(
      config.utils?.[
        'server-empty-only'
      ]?.[
        'check-interval'
      ]
    ) || 15000
  );

}


function shouldLeaveWhenPlayerJoins() {

  return (
    config.utils?.[
      'server-empty-only'
    ]?.[
      'leave-when-player-joins'
    ] !== false
  );

}


/* =========================================================
   GET OTHER PLAYERS
========================================================= */

function getOtherPlayers() {

  if (
    !bot ||
    !bot.players
  ) {

    return [];

  }

  const botUsername =
    config[
      'bot-account'
    ].username;


  return Object.keys(
    bot.players
  ).filter(
    username =>
      username &&
      username.toLowerCase() !==
        botUsername.toLowerCase()
  );

}


/* =========================================================
   CHECK SERVER EMPTY
========================================================= */

function checkServerEmpty() {

  return new Promise(
    (resolve) => {

      const address =
        `${config.server.ip}:${config.server.port}`;

      const url =
        `https://api.mcsrvstat.us/3/${encodeURIComponent(
          address
        )}`;


      const request =
        https.get(
          url,
          {
            headers: {
              'User-Agent':
                'AFK-Bot'
            },

            timeout: 10000

          },

          (response) => {

            let body = '';


            response.on(
              'data',
              (chunk) => {

                body += chunk;

              }
            );


            response.on(
              'end',
              () => {

                try {

                  const data =
                    JSON.parse(
                      body
                    );


                  if (
                    !data.online
                  ) {

                    console.log(
                      '[ServerCheck] Server offline atau status tidak tersedia.'
                    );

                    resolve(false);

                    return;

                  }


                  const online =
                    Number(
                      data.players?.online ||
                      0
                    );


                  console.log(
                    `[ServerCheck] Player online: ${online}`
                  );


                  resolve(
                    online === 0
                  );

                }

                catch (error) {

                  console.log(
                    '[ServerCheck] Gagal membaca response server.'
                  );

                  resolve(false);

                }

              }
            );

          }
        );


      request.on(
        'error',
        (error) => {

          console.log(
            `[ServerCheck] API error: ${error.message}`
          );

          resolve(false);

        }
      );


      request.on(
        'timeout',
        () => {

          request.destroy();

          console.log(
            '[ServerCheck] API timeout.'
          );

          resolve(false);

        }
      );

    }
  );

}


/* =========================================================
   WAIT FOR EMPTY SERVER
========================================================= */

function scheduleEmptyServerCheck() {

  if (
    reconnectTimeoutId
  ) {

    return;

  }

  const interval =
    getServerEmptyCheckInterval();


  botState.waitingForEmptyServer =
    true;


  console.log(
    `[ServerCheck] Server belum kosong. Cek lagi dalam ${interval / 1000} detik.`
  );


  reconnectTimeoutId =
    setTimeout(
      () => {

        reconnectTimeoutId =
          null;

        tryCreateBot();

      },

      interval
    );

}


/* =========================================================
   TRY CREATE BOT
========================================================= */

async function tryCreateBot() {

  if (
    botState.connected
  ) {

    return;

  }


  if (
    isReconnecting
  ) {

    return;

  }


  if (
    bot
  ) {

    return;

  }


  /* ===============================================
     SERVER EMPTY CHECK
  =============================================== */

  if (
    isServerEmptyModeEnabled()
  ) {

    botState.waitingForEmptyServer =
      true;


    console.log(
      '[ServerCheck] Mengecek jumlah player...'
    );


    const empty =
      await checkServerEmpty();


    if (!empty) {

      scheduleEmptyServerCheck();

      return;

    }


    console.log(
      '[ServerCheck] Server kosong. Bot akan masuk.'
    );


    botState.waitingForEmptyServer =
      false;

  }


  createBotConnection();

}


/* =========================================================
   CREATE BOT CONNECTION
========================================================= */

function createBotConnection() {

  if (
    bot
  ) {

    return;

  }


  console.log(
    '[Bot] Membuat koneksi Minecraft...'
  );


  const botVersion =
    config.server.version &&
    config.server.version.trim() !== ''
      ? config.server.version
      : false;


  try {

    bot =
      mineflayer.createBot({

        username:
          config[
            'bot-account'
          ].username,

        password:
          config[
            'bot-account'
          ].password ||
          undefined,

        auth:
          config[
            'bot-account'
          ].type,

        host:
          config.server.ip,

        port:
          config.server.port,

        version:
          botVersion,

        hideErrors:
          false,

        checkTimeoutInterval:
          600000

      });

  }

  catch (error) {

    addError(error);

    bot = null;

    scheduleReconnect();

    return;

  }


  /* =====================================================
     PATHFINDER
  ===================================================== */

  bot.loadPlugin(
    pathfinder
  );


  /* =====================================================
     CONNECTION TIMEOUT
  ===================================================== */

  connectionTimeoutId =
    setTimeout(
      () => {

        if (
          !botState.connected
        ) {

          console.log(
            '[Bot] Connection timeout.'
          );


          try {

            if (bot) {

              bot.quit(
                'Connection timeout'
              );

            }

          }

          catch {}

        }

      },

      150000
    );


  /* =====================================================
     SPAWN
  ===================================================== */

  bot.once(
    'spawn',
    () => {

      clearBotTimeouts();


      botState.connected =
        true;


      botState.waitingForEmptyServer =
        false;


      botState.reconnectAttempts =
        0;


      botState.lastActivity =
        Date.now();


      console.log(
        `[Bot] Berhasil masuk sebagai ${bot.username}`
      );


      /* ===============================================
         PLAYER MONITOR
      =============================================== */

      if (
        isServerEmptyModeEnabled() &&
        shouldLeaveWhenPlayerJoins()
      ) {

        addInterval(
          () => {

            if (
              !bot ||
              !botState.connected
            ) {

              return;

            }


            const players =
              getOtherPlayers();


            if (
              players.length > 0
            ) {

              console.log(
                `[ServerCheck] Player terdeteksi: ${players.join(', ')}`
              );


              console.log(
                '[ServerCheck] Bot keluar karena player lain masuk.'
              );


              try {

                bot.quit(
                  'Player joined'
                );

              }

              catch (error) {

                console.log(
                  `[Bot] Quit error: ${error.message}`
                );

              }

            }

          },

          5000
        );

      }


      /* ===============================================
         MINECRAFT DATA
      =============================================== */

      try {

        const mcData =
          require(
            'minecraft-data'
          )(
            bot.version
          );


        bot.mcData =
          mcData;


        bot.defaultMovement =
          new Movements(
            bot,
            mcData
          );

      }

      catch (error) {

        console.log(
          `[Bot] minecraft-data error: ${error.message}`
        );

      }


      initializeModules();

    }
  );


  /* =====================================================
     KICK
  ===================================================== */

  bot.on(
    'kicked',
    (reason) => {

      console.log(
        `[Bot] Kicked: ${reason}`
      );

      botState.connected =
        false;

    }
  );


  /* =====================================================
     ERROR
  ===================================================== */

  bot.on(
    'error',
    (error) => {

      console.log(
        `[Bot] Error: ${error.message}`
      );

      addError(error);

    }
  );


  /* =====================================================
     END
  ===================================================== */

  bot.on(
    'end',
    (reason) => {

      console.log(
        `[Bot] Disconnected: ${
          reason ||
          'Unknown reason'
        }`
      );


      botState.connected =
        false;


      clearBotTimeouts();


      clearAllIntervals();


      bot = null;


      if (
        config.utils?.[
          'auto-reconnect'
        ]
      ) {

        scheduleReconnect();

      }

    }
  );


  /* =====================================================
     CHAT LOG
  ===================================================== */

  bot.on(
    'messagestr',
    (message) => {

      botState.lastActivity =
        Date.now();


      if (
        config.utils?.[
          'chat-log'
        ]
      ) {

        console.log(
          `[Chat] ${message}`
        );

      }

    }
  );


  /* =====================================================
     CHAT
  ===================================================== */

  bot.on(
    'chat',
    (
      username,
      message
    ) => {

      botState.lastActivity =
        Date.now();


      chatModule(
        username,
        message
      );

    }
  );


  /* =====================================================
     MOVE
  ===================================================== */

  bot.on(
    'move',
    () => {

      botState.lastActivity =
        Date.now();

    }
  );

}


/* =========================================================
   RECONNECT
========================================================= */

function scheduleReconnect() {

  if (
    !config.utils?.[
      'auto-reconnect'
    ]
  ) {

    return;

  }


  if (
    reconnectTimeoutId
  ) {

    return;

  }


  botState.reconnectAttempts++;


  const delay =
    getReconnectDelay();


  console.log(
    `[Reconnect] Mencoba reconnect dalam ${Math.round(
      delay / 1000
    )} detik.`
  );


  isReconnecting =
    true;


  reconnectTimeoutId =
    setTimeout(
      () => {

        reconnectTimeoutId =
          null;

        isReconnecting =
          false;

        tryCreateBot();

      },

      delay
    );

}


/* =========================================================
   MODULES
========================================================= */

function initializeModules() {

  if (
    !bot
  ) {

    return;

  }


  /* =====================================================
     AUTO AUTH
  ===================================================== */

  if (
    config.utils?.[
      'auto-auth'
    ]?.enabled
  ) {

    const password =
      config.utils[
        'auto-auth'
      ].password;


    if (
      password
    ) {

      bot.on(
        'messagestr',
        (message) => {

          const lower =
            message.toLowerCase();


          if (
            lower.includes(
              '/login'
            ) ||
            lower.includes(
              'login'
            )
          ) {

            setTimeout(
              () => {

                try {

                  bot.chat(
                    `/login ${password}`
                  );

                }

                catch {}

              },

              1000
            );

          }


          if (
            lower.includes(
              'register'
            )
          ) {

            setTimeout(
              () => {

                try {

                  bot.chat(
                    `/register ${password} ${password}`
                  );

                }

                catch {}

              },

              1000
            );

          }

        }
      );

    }

  }


  /* =====================================================
     CHAT MESSAGES
  ===================================================== */

  if (
    config.utils?.[
      'chat-messages'
    ]?.enabled
  ) {

    const messages =
      config.utils[
        'chat-messages'
      ].messages ||
      [];


    const repeatDelay =
      (
        Number(
          config.utils[
            'chat-messages'
          ]?.[
            'repeat-delay'
          ]
        ) || 120
      ) * 1000;


    if (
      messages.length > 0
    ) {

      let index = 0;


      addInterval(
        () => {

          if (
            !bot ||
            !botState.connected
          ) {

            return;

          }


          const message =
            messages[
              index %
              messages.length
            ];


          index++;


          try {

            bot.chat(
              message
            );

          }

          catch {}

        },

        repeatDelay
      );

    }

  }


  /* =====================================================
     POSITION
  ===================================================== */

  if (
    config.position?.enabled
  ) {

    const x =
      Number(
        config.position.x
      ) || 0;


    const y =
      Number(
        config.position.y
      ) || 100;


    const z =
      Number(
        config.position.z
      ) || 0;


    addInterval(
      () => {

        if (
          !bot ||
          !botState.connected
        ) {

          return;

        }


        try {

          bot.pathfinder.setGoal(
            new GoalBlock(
              x,
              y,
              z
            )
          );

        }

        catch {}

      },

      10000
    );

  }


  /* =====================================================
     ANTI AFK
  ===================================================== */

  if (
    config.utils?.[
      'anti-afk'
    ]?.enabled
  ) {

    /* ARM SWING */

    addInterval(
      () => {

        if (
          !bot ||
          !botState.connected
        ) {

          return;

        }


        try {

          bot.swingArm(
            'right'
          );

        }

        catch {}

      },

      30000
    );


    /* HOTBAR */

    addInterval(
      () => {

        if (
          !bot ||
          !botState.connected
        ) {

          return;

        }


        try {

          const current =
            bot.quickBarSlot;


          bot.setQuickBarSlot(
            (current + 1) % 9
          );

        }

        catch {}

      },

      45000
    );


    /* SNEAK */

    if (
      config.utils[
        'anti-afk'
      ].sneak
    ) {

      addInterval(
        () => {

          if (
            !bot ||
            !botState.connected
          ) {

            return;

          }


          try {

            bot.setControlState(
              'sneak',
              true
            );


            setTimeout(
              () => {

                if (
                  bot
                ) {

                  try {

                    bot.setControlState(
                      'sneak',
                      false
                    );

                  }

                  catch {}

                }

              },

              500
            );

          }

          catch {}

        },

        60000
      );

    }


    /* MICRO WALK */

    addInterval(
      () => {

        if (
          !bot ||
          !botState.connected
        ) {

          return;

        }


        try {

          bot.setControlState(
            'forward',
            true
          );


          setTimeout(
            () => {

              if (
                bot
              ) {

                try {

                  bot.setControlState(
                    'forward',
                    false
                  );

                }

                catch {}

              }

            },

            800
          );

        }

        catch {}

      },

      75000
    );

  }


  /* =====================================================
     CIRCLE WALK
  ===================================================== */

  if (
    config.movement?.[
      'circle-walk'
    ]?.enabled
  ) {

    const speed =
      Number(
        config.movement[
          'circle-walk'
        ]?.speed
      ) || 3000;


    let direction = 1;


    addInterval(
      () => {

        if (
          !bot ||
          !botState.connected
        ) {

          return;

        }


        try {

          direction *= -1;


          if (
            direction === 1
          ) {

            bot.setControlState(
              'left',
              true
            );

          }

          else {

            bot.setControlState(
              'right',
              true
            );

          }


          bot.setControlState(
            'forward',
            true
          );


          setTimeout(
            () => {

              if (
                bot
              ) {

                try {

                  bot.setControlState(
                    'forward',
                    false
                  );

                  bot.setControlState(
                    'left',
                    false
                  );

                  bot.setControlState(
                    'right',
                    false
                  );

                }

                catch {}

              }

            },

            Math.min(
              speed,
              4000
            )
          );

        }

        catch {}

      },

      speed
    );

  }


  /* =====================================================
     LOOK AROUND
  ===================================================== */

  if (
    config.movement?.[
      'look-around'
    ]?.enabled
  ) {

    const interval =
      Number(
        config.movement[
          'look-around'
        ]?.interval
      ) || 5000;


    addInterval(
      () => {

        if (
          !bot ||
          !botState.connected ||
          !bot.entity
        ) {

          return;

        }


        try {

          const yaw =
            Math.random() *
            Math.PI *
            2;


          const pitch =
            (
              Math.random() -
              0.5
            ) * 0.6;


          bot.look(
            yaw,
            pitch,
            true
          );

        }

        catch {}

      },

      interval
    );

  }


  /* =====================================================
     RANDOM JUMP
  ===================================================== */

  if (
    config.movement?.[
      'random-jump'
    ]?.enabled
  ) {

    const interval =
      Number(
        config.movement[
          'random-jump'
        ]?.interval
      ) || 10000;


    addInterval(
      () => {

        if (
          !bot ||
          !botState.connected
        ) {

          return;

        }


        try {

          bot.setControlState(
            'jump',
            true
          );


          setTimeout(
            () => {

              if (
                bot
              ) {

                try {

                  bot.setControlState(
                    'jump',
                    false
                  );

                }

                catch {}

              }

            },

            500
          );

        }

        catch {}

      },

      interval
    );

  }


  /* =====================================================
     AVOID MOBS
  ===================================================== */

  if (
    config.modules?.avoidMobs
  ) {

    addInterval(
      () => {

        if (
          !bot ||
          !botState.connected ||
          !bot.entity
        ) {

          return;

        }


        try {

          const entities =
            Object.values(
              bot.entities || {}
            );


          const hostileNames = [

            'zombie',
            'skeleton',
            'creeper',
            'spider',
            'witch',
            'enderman',
            'phantom'

          ];


          for (
            const entity of entities
          ) {

            if (
              !entity ||
              !entity.position ||
              !entity.name
            ) {

              continue;

            }


            if (
              !hostileNames.includes(
                entity.name
              )
            ) {

              continue;

            }


            const distance =
              bot.entity.position.distanceTo(
                entity.position
              );


            if (
              distance < 5
            ) {

              bot.setControlState(
                'back',
                true
              );


              setTimeout(
                () => {

                  if (
                    bot
                  ) {

                    try {

                      bot.setControlState(
                        'back',
                        false
                      );

                    }

                    catch {}

                  }

                },

                1000
              );

            }

          }

        }

        catch {}

      },

      3000
    );

  }


  /* =====================================================
     COMBAT
  ===================================================== */

  if (
    config.modules?.combat &&
    config.combat?.[
      'attack-mobs'
    ]
  ) {

    addInterval(
      () => {

        if (
          !bot ||
          !botState.connected ||
          !bot.entity
        ) {

          return;

        }


        try {

          const entities =
            Object.values(
              bot.entities || {}
            );


          const hostileNames = [

            'zombie',
            'skeleton',
            'spider',
            'creeper',
            'witch',
            'enderman'

          ];


          let target = null;

          let closest =
            Infinity;


          for (
            const entity of entities
          ) {

            if (
              !entity ||
              !entity.position ||
              !entity.name
            ) {

              continue;

            }


            if (
              !hostileNames.includes(
                entity.name
              )
            ) {

              continue;

            }


            const distance =
              bot.entity.position.distanceTo(
                entity.position
              );


            if (
              distance <
                closest &&
              distance < 4
            ) {

              closest =
                distance;

              target =
                entity;

            }

          }


          if (
            target
          ) {

            bot.lookAt(
              target.position.offset(
                0,
                1,
                0
              ),
              true
            );


            bot.attack(
              target
            );

          }

        }

        catch {}

      },

      1500
    );

  }


  /* =====================================================
     AUTO EAT
  ===================================================== */

  if (
    config.combat?.[
      'auto-eat'
    ]
  ) {

    addInterval(
      async () => {

        if (
          !bot ||
          !botState.connected
        ) {

          return;

        }


        if (
          typeof bot.food !==
          'number'
        ) {

          return;

        }


        if (
          bot.food >= 12
        ) {

          return;

        }


        try {

          const food =
            bot.inventory
              .items()
              .find(
                item =>
                  [
                    'bread',
                    'cooked_beef',
                    'cooked_porkchop',
                    'cooked_chicken',
                    'cooked_mutton',
                    'cooked_rabbit',
                    'baked_potato',
                    'golden_apple'
                  ].includes(
                    item.name
                  )
              );


          if (
            !food
          ) {

            return;

          }


          await bot.equip(
            food,
            'hand'
          );


          await bot.consume();

        }

        catch {}

      },

      5000
    );

  }


  console.log(
    '[Modules] Semua module berhasil diinisialisasi.'
  );

}


/* =========================================================
   CHAT MODULE
========================================================= */

function chatModule(
  username,
  message
) {

  if (
    !config.chat?.respond
  ) {

    return;

  }


  if (
    !bot ||
    !botState.connected
  ) {

    return;

  }


  if (
    username ===
    bot.username
  ) {

    return;

  }


  const lower =
    message
      .toLowerCase()
      .trim();


  if (
    lower === 'hi' ||
    lower === 'hello' ||
    lower.includes('halo')
  ) {

    try {

      bot.chat(
        `Hello ${username}!`
      );

    }

    catch {}

  }


  if (
    lower === '!tp'
  ) {

    try {

      const pos =
        bot.entity.position;


      bot.chat(
        `Posisi saya: ${Math.round(
          pos.x
        )} ${Math.round(
          pos.y
        )} ${Math.round(
          pos.z
        )}`
      );

    }

    catch {}

  }

}


/* =========================================================
   DISCORD WEBHOOK
========================================================= */

function sendDiscord(
  message
) {

  const webhookUrl =
    config.discord?.webhookUrl;


  if (
    !webhookUrl ||
    webhookUrl.includes(
      'YOUR_DISCORD_WEBHOOK'
    )
  ) {

    return;

  }


  try {

    const url =
      new URL(
        webhookUrl
      );


    const data =
      JSON.stringify({
        content: message
      });


    const request =
      https.request(
        {
          hostname:
            url.hostname,

          path:
            url.pathname +
            url.search,

          method:
            'POST',

          headers: {

            'Content-Type':
              'application/json',

            'Content-Length':
              Buffer.byteLength(
                data
              )

          }

        },

        response => {

          response.on(
            'data',
            () => {}
          );

        }
      );


    request.on(
      'error',
      () => {}
    );


    request.write(
      data
    );


    request.end();

  }

  catch {}

}


/* =========================================================
   CRASH RECOVERY
========================================================= */

process.on(
  'uncaughtException',
  error => {

    console.error(
      '[Process] Uncaught exception:',
      error
    );


    addError(
      error
    );


    clearBotTimeouts();

    clearAllIntervals();


    if (
      reconnectTimeoutId
    ) {

      clearTimeout(
        reconnectTimeoutId
      );

      reconnectTimeoutId =
        null;

    }


    if (
      bot
    ) {

      try {

        bot.quit(
          'Process recovery'
        );

      }

      catch {}


      bot =
        null;

    }


    botState.connected =
      false;


    if (
      config.utils?.[
        'auto-reconnect'
      ]
    ) {

      scheduleReconnect();

    }

  }
);


/* =========================================================
   UNHANDLED REJECTION
========================================================= */

process.on(
  'unhandledRejection',
  error => {

    console.error(
      '[Process] Unhandled rejection:',
      error
    );


    addError(
      error
    );

  }
);


/* =========================================================
   SHUTDOWN
========================================================= */

function shutdown() {

  console.log(
    '[Process] Shutting down...'
  );


  clearBotTimeouts();

  clearAllIntervals();


  if (
    reconnectTimeoutId
  ) {

    clearTimeout(
      reconnectTimeoutId
    );

    reconnectTimeoutId =
      null;

  }


  if (
    bot
  ) {

    try {

      bot.quit(
        'Server shutdown'
      );

    }

    catch {}

  }


  try {

    server.close();

  }

  catch {}


  process.exit(
    0
  );

}


process.on(
  'SIGTERM',
  shutdown
);

process.on(
  'SIGINT',
  shutdown
);


/* =========================================================
   START
========================================================= */

console.log(
  '========================================'
);

console.log(
  '           AFK BOT STARTING'
);

console.log(
  '========================================'
);

console.log(
  `Server: ${config.server.ip}:${config.server.port}`
);

console.log(
  `Username: ${config['bot-account'].username}`
);

console.log(
  `Server Empty Mode: ${
    isServerEmptyModeEnabled()
      ? 'ON'
      : 'OFF'
  }`
);

console.log(
  '========================================'
);


tryCreateBot();
