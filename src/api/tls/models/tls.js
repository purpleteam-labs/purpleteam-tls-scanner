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
const { readFile } = require('fs').promises;
const cucumber = require('@cucumber/cucumber');
const { GherkinStreams } = require('@cucumber/gherkin-streams');

const statusMap = {
  'Awaiting Job.': true,
  'Initialising Tester.': false,
  'Tester initialised.': false,
  'Tls tests are running.': false
};

let testingProps = null;


class Tls {
  constructor({ log, strings, emissary, cucumber: cucumberConfig, results, publisher, debug }) {
    // Todo: make class fields private.
    this.log = log;
    this.strings = strings;
    this.emissary = emissary;
    this.cucumber = cucumberConfig;
    this.results = results;
    this.publisher = publisher; // Todo: Remove publisher?
    this.debug = debug;
    this.status = (state) => {
      if (state) {
        Object.keys(statusMap).forEach((k) => { statusMap[k] = false; });
        statusMap[state] = true;
        this.log.info(`Setting status to: "${state}"`, { tags: ['tls'] });
        return state;
      }
      return Object.entries(statusMap).find((e) => e[1] === true)[0];
    };
  }

  #startCuc(testingProperties) {
    const { debug: { execArgvDebugString, firstChildProcessInspectPort } } = this;
    const cucumberArgs = this.createCucumberArgs(testingProperties.runableSessionProps);

    // runableSessionProps: {
    //   sessionProps: {
    //     protocol: "http",
    //     ip: "pt-sut-cont",
    //     port: 4000,
    //     testSession: {
    //       type: "tlsScanner",
    //       id: "NA",
    //       attributes: {
    //         alertThreshold: 12,
    //       },
    //     }
    //   }
    // }

    if (this.status() === 'Tls tests are running.') return;

    const cucCli = spawn('node', [...(execArgvDebugString ? [`${execArgvDebugString}:${firstChildProcessInspectPort}`] : []), ...cucumberArgs], { cwd: process.cwd(), env: process.env, argv0: process.argv[0] });
    this.log.notice(`cucCli process with PID "${cucCli.pid}" has been spawned for Test Session with Id "${testingProperties.runableSessionProps.sessionProps.testSession.id}"`, { tags: ['tls'] });
    this.status('Tls tests are running.');

    cucCli.stdout.on('data', (data) => {
      process.stdout.write(data); // Todo: Check these, can they use log?
    });

    cucCli.stderr.on('data', (data) => {
      process.stdout.write(data); // Todo: Check these, can they use log?
    });

    cucCli.on('exit', async (code, signal) => { // Do we need this async?
      const message = `Child process "cucumber Cli" running session with id: "${testingProperties.runableSessionProps.sessionProps.testSession.id}" exited with code: "${code}", and signal: "${signal}".`;
      this.log[`${code === 0 ? 'info' : 'error'}`](message, { tags: ['tls'] });
      this.status('Awaiting Job.');
    });

    cucCli.on('close', (code) => {
      const message = `"close" event was emitted with code: "${code}" for "cucumber Cli" running session with id "${testingProperties.runableSessionProps.sessionProps.testSession.id}".`;
      this.log[`${code === 0 ? 'info' : 'error'}`](message, { tags: ['tls'] });
    });

    cucCli.on('error', (err) => {
      process.stdout.write(`Failed to start cucCli sub-process. The error was: ${err}.`, { tags: ['tls'] });
      this.status('Awaiting Job.');
    });
  }

  async initTester(testJob) {
    this.log.info(`Status currently set to: "${this.status()}"`, { tags: ['tls'] });
    if (this.status() !== 'Awaiting Job.') return this.status();
    this.status('Initialising Tester.');
    const testSession = testJob.included.find((resourceObject) => resourceObject.type === 'tlsScanner');

    testingProps = {
      runableSessionProps: {
        sessionProps: {
          protocol: testJob.data.attributes.sutProtocol,
          ip: testJob.data.attributes.sutIp,
          port: testJob.data.attributes.sutPort,
          testSession
        }
      }
    };

    return this.status('Tester initialised.');
  }

  startCucs() {
    this.#startCuc(testingProps);
  }

  async testPlan(testJob) { // eslint-disable-line no-unused-vars
    const cucumberArgs = this.createCucumberArgs({});
    const cucumberCliInstance = new cucumber.Cli({
      argv: ['node', ...cucumberArgs],
      cwd: process.cwd(),
      stdout: process.stdout
    });
    const activeFeatureFileUris = await this.#getActiveFeatureFileUris(cucumberCliInstance);
    const testPlanText = await this.#getTestPlanText(activeFeatureFileUris);
    return testPlanText;
  }

  createCucumberArgs({ sessionProps = {} }) {
    const emissaryProperties = { reportDir: this.emissary.report.dir };

    const cucumberParameters = {
      emissaryProperties,
      sutProperties: sessionProps,
      cucumber: { timeout: this.cucumber.timeout }
    };

    const parameters = JSON.stringify(cucumberParameters);

    this.log.debug(`The cucumberParameters are: ${parameters}`, { tags: ['tls'] });

    const cucumberArgs = [
      this.cucumber.binary,
      this.cucumber.features,
      '--require',
      this.cucumber.steps,
      /* '--exit', */
      `--format=message:${this.results.dir}result_tlsScannerId-${sessionProps.testSession ? sessionProps.testSession.id : 'noSessionPropsAvailable'}_${this.strings.NowAsFileName('-')}.NDJSON`,
      /* Todo: Provide ability for Build User to pass flag to disable colours */
      '--format-options',
      '{"colorsEnabled": true}',
      '--tags',
      this.cucumber.tagExpression,
      '--world-parameters',
      parameters
    ];

    // Todo: KC: Validation, Filtering and Sanitisation required, as these are being executed, although they should all be under our control.
    return cucumberArgs;
  }

  // eslint-disable-next-line class-methods-use-this
  async #getActiveFeatureFileUris(cucumberCli) {
    const configuration = await cucumberCli.getConfiguration();
    const pickleFilter = (() => new (require('@cucumber/cucumber/lib/pickle_filter')).default(configuration.pickleFilterOptions))(); // eslint-disable-line global-require, new-cap

    const streamToArray = async (readableStream) => new Promise((resolve, reject) => {
      const items = [];
      readableStream.on('data', (item) => items.push(item));
      readableStream.on('error', (err) => reject(err));
      readableStream.on('end', () => resolve(items));
    });

    const activeFeatureFileUris = async () => {
      const envelopes = await streamToArray(GherkinStreams.fromPaths(configuration.featurePaths, { includeSource: false, includeGherkinDocument: true, includePickles: true }));
      let gherkinDocument = null;
      const pickles = [];

      envelopes.forEach((e) => {
        if (e.gherkinDocument) {
          gherkinDocument = e.gherkinDocument;
        } else if (e.pickle && gherkinDocument) {
          const { pickle } = e;
          if (pickleFilter.matches({ gherkinDocument, pickle })) pickles.push({ pickle });
        }
      });

      return pickles
        .map((p) => p.pickle.uri)
        .reduce((accum, cV) => [...accum, ...(accum.includes(cV) ? [] : [cV])], []);
    };

    return activeFeatureFileUris();
  }

  // eslint-disable-next-line class-methods-use-this
  async #getTestPlanText(activeFeatureFileUris) {
    return (await Promise.all(activeFeatureFileUris
      .map((aFFU) => readFile(aFFU, { encoding: 'utf8' }))))
      .reduce((accumulatedFeatures, feature) => `${accumulatedFeatures}${!accumulatedFeatures.length > 0 ? feature : `\n\n${feature}`}`, '');
  }
}

module.exports = Tls;
