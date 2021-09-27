// Copyright (C) 2017-2021 BinaryMist Limited. All rights reserved.

// This file is part of PurpleTeam.

// PurpleTeam is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation version 3.

// PurpleTeam is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this PurpleTeam project. If not, see <https://www.gnu.org/licenses/>.

const { spawn } = require('child_process');

const internals = {};

internals.runTestSession = ({ reset, app: { log, status, testSessionId, cucumberArgs, debug: { execArgvDebugString, firstChildProcessInspectPort } }, appInstance }) => {
  // if (this.#status() === 'Tls tests are running.') return; // This shouldn't be needed now.

  const cucCli = spawn('node', [...(execArgvDebugString ? [`${execArgvDebugString}:${firstChildProcessInspectPort}`] : []), ...cucumberArgs], { cwd: process.cwd(), env: process.env, argv0: process.argv[0] });
  log.notice(`cucCli process with PID "${cucCli.pid}" has been spawned for Test Session with Id "${testSessionId}"`, { tags: ['tls'] });
  status.call(appInstance, 'Tls tests are running.'); // Todo: Test the this in status.

  cucCli.stdout.on('data', (data) => {
    process.stdout.write(data);
  });

  cucCli.stderr.on('data', (data) => {
    process.stdout.write(data);
  });

  cucCli.on('exit', (code, signal) => {
    const message = `Child process "cucumber Cli" running session with id: "${testSessionId}" exited with code: "${code}", and signal: "${signal}".`;
    log[`${code === 0 ? 'info' : 'error'}`](message, { tags: ['tls'] });
    reset.call(appInstance);
  });

  cucCli.on('close', (code) => {
    const message = `"close" event was emitted with code: "${code}" for "cucumber Cli" running session with id "${testSessionId}".`;
    log[`${code === 0 ? 'info' : 'error'}`](message, { tags: ['tls'] });
  });

  cucCli.on('error', (err) => {
    process.stdout.write(`Failed to start cucCli sub-process. The error was: ${err}.`, { tags: ['tls'] });
    reset.call(appInstance); // Todo: Test the this in reset.
  });
};

module.exports = { startCuc: (parameters) => { internals.runTestSession(parameters); } };
