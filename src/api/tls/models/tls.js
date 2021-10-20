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

const { readFile } = require('fs').promises;
const cucumber = require('@cucumber/cucumber');
const { GherkinStreams } = require('@cucumber/gherkin-streams');

const model = require('.');

class Tls {
  #log;
  #strings;
  #emissary;
  #cucumber;
  #results;
  #debug;
  #testingProps;

  constructor({ log, strings, emissary, cucumber: cucumberConfig, results, debug }) {
    this.#log = log;
    this.#strings = strings;
    this.#emissary = emissary;
    this.#cucumber = cucumberConfig;
    this.#results = results;
    this.#debug = debug;
    this.#testingProps = null;
  }

  #statusMap = {
    'Awaiting Job.': true,
    'Initialising Tester.': false,
    'Tester initialised.': false,
    'Tls tests are running.': false
  };

  #status(state) {
    if (state) {
      Object.keys(this.#statusMap).forEach((k) => { this.#statusMap[k] = false; });
      this.#statusMap[state] = true;
      this.#log.info(`Setting status to: "${state}"`, { tags: ['tls'] });
      return state;
    }
    return Object.entries(this.#statusMap).find((e) => e[1] === true)[0];
  }

  reset() {
    // Assumption is that cucCli isn't running.
    this.#status('Awaiting Job.');
    this.#testingProps = null;
  }

  async initTester(testJob) {
    this.#log.info(`Status currently set to: "${this.#status()}"`, { tags: ['tls'] });
    if (this.#status() !== 'Awaiting Job.') return this.#status();
    this.#status('Initialising Tester.');
    const testSession = testJob.included.find((resourceObject) => resourceObject.type === 'tlsScanner');

    this.#testingProps = {
      runableSessionProps: {
        sessionProps: {
          protocol: testJob.data.attributes.sutProtocol,
          ip: testJob.data.attributes.sutIp,
          port: testJob.data.attributes.sutPort,
          testSession
        }
      }
    };

    return this.#status('Tester initialised.');
  }

  startCucs() {
    if (this.#testingProps) {
      model.cuc.startCuc({
        reset: this.reset,
        app: {
          log: this.#log,
          status: this.#status,
          testSessionId: this.#testingProps.runableSessionProps.sessionProps.testSession.id,
          cucumberArgs: this.#createCucumberArgs(this.#testingProps.runableSessionProps),
          debug: {
            execArgvDebugString: this.#debug.execArgvDebugString,
            firstChildProcessInspectPort: this.#debug.firstChildProcessInspectPort
          }
        },
        appInstance: this
      });
    } else {
      this.#log.error('this.#testingProps was falsy. It appears that the Tester was reset between calling initTester and startCucs', { tags: ['tls'] });
    }
  }

  async testPlan(testJob) { // eslint-disable-line no-unused-vars
    const cucumberArgs = this.#createCucumberArgs({});
    const cucumberCliInstance = new cucumber.Cli({
      argv: ['node', ...cucumberArgs],
      cwd: process.cwd(),
      stdout: process.stdout
    });
    const activeFeatureFileUris = await this.#getActiveFeatureFileUris(cucumberCliInstance);
    const testPlanText = await this.#getTestPlanText(activeFeatureFileUris);
    return testPlanText;
  }

  #createCucumberArgs({ sessionProps = {} }) {
    const emissaryProperties = { reportDir: this.#emissary.report.dir };

    const cucumberParameters = {
      emissaryProperties,
      sutProperties: sessionProps,
      cucumber: { timeout: this.#cucumber.timeout }
    };

    const parameters = JSON.stringify(cucumberParameters);

    this.#log.debug(`The cucumberParameters are: ${parameters}`, { tags: ['tls'] });

    const cucumberArgs = [
      this.#cucumber.binary,
      this.#cucumber.features,
      '--require',
      this.#cucumber.steps,
      /* '--exit', */
      `--format=message:${this.#results.dir}result_tlsScannerId-${sessionProps.testSession ? sessionProps.testSession.id : 'noSessionPropsAvailable'}_${this.#strings.NowAsFileName('-')}.NDJSON`,
      /* Todo: Provide ability for Build User to pass flag to disable colours */
      '--format-options',
      '{"colorsEnabled": true}',
      '--tags',
      this.#cucumber.tagExpression,
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
