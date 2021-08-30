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

const convict = require('convict');
const { duration } = require('convict-format-with-moment');
const path = require('path');

convict.addFormat(duration);

const schema = {
  env: {
    doc: 'The application environment.',
    format: ['cloud', 'local', 'test'],
    default: 'cloud',
    env: 'NODE_ENV'
  },
  logger: {
    level: {
      doc: 'Write all log events with this level and below. Syslog levels used: https://github.com/winstonjs/winston#logging-levels',
      format: ['emerg', 'alert', 'crit', 'error', 'warning', 'notice', 'info', 'debug'],
      default: 'notice'
    }
  },
  processMonitoring: {
    on: {
      doc: 'Whether or not to capture and log process events.',
      format: 'Boolean',
      default: false
    },
    interval: {
      doc: 'The interval in milliseconds to capture and log the process events.',
      format: 'duration',
      default: 10000
    }
  },
  debug: {
    execArgvDebugString: {
      doc: 'The process.execArgv debug string if the process is running with it. Used to initiate child processes with in order to debug them.',
      format: String,
      default: process.execArgv.indexOf('--inspect-brk=0.0.0.0') !== -1 ? '--inspect-brk=0.0.0.0' : undefined
    },
    firstChildProcessInspectPort: {
      doc: 'The first child process debug port to attach to as defined in the .vscode launch.json',
      format: 'port',
      default: 9329
    }
  },
  host: {
    port: {
      doc: 'The port of this host.',
      format: 'port',
      default: 3020,
      env: 'PORT'
    },
    host: {
      doc: 'The IP address or hostname of this host.',
      format: String,
      default: '240.0.0.0'
    }
  },
  redis: {
    clientCreationOptions: {
      doc: 'The options used for creating the redis client.',
      format: (val) => typeof val === 'object',
      default: {
        port: 6379,
        host: 'redis'
        // "host": "172.17.0.2" // host networking or not running in container
      }
    }
  },
  messageChannelHeartBeatInterval: {
    doc: 'This is used to send heart beat messages every n milliseconds. Primarily to keep the orchestrator\'s testerWatcher longPoll timeout from being reached.',
    format: 'duration',
    default: 15000
  },
  emissary: {
    report: {
      dir: {
        doc: 'The location of the report.',
        format: String,
        default: '/var/log/purpleteam/outcomes/'
      }
    }
  },
  sut: {
    tlsScannerSeverity: {
      doc: 'The attack strength of the active scanner.',
      format: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: undefined
    },
    alertThreshold: {
      doc: 'The number of alerts specified by the Build User that the alerts found by Zap should not exceed.',
      format: 'int',
      default: 0
    }
  },
  cucumber: {
    features: {
      doc: 'The location of the feature files.',
      format: String,
      default: 'src/features'
    },
    steps: {
      doc: 'The location of the step files.',
      format: String,
      default: 'src/steps'
    },
    tagExpression: {
      doc: 'The tag expression without the \'--tag\' to run Cucumber with.',
      format: String,
      default: 'not @simple_math'
    },
    binary: {
      doc: 'The location of the Cucumber binary.',
      format: String,
      // default: `${process.cwd()}/node_modules/.bin/cucumber-js`
      default: `${process.cwd()}/bin/purpleteamCucumber`
    },
    timeout: {
      doc: 'The value used to set the timeout (https://github.com/cucumber/cucumber-js/blob/master/docs/support_files/timeouts.md)',
      format: 'duration',
      default: 5000
    }
  },
  results: {
    dir: {
      doc: 'The location of the results.',
      format: String,
      default: '/var/log/purpleteam/outcomes/'
    }
  }
};

const config = convict(schema);
config.loadFile(path.join(__dirname, `config.${process.env.NODE_ENV}.json`));
config.validate();

module.exports = config;
