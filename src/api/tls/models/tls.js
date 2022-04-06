// Copyright (C) 2017-2022 BinaryMist Limited. All rights reserved.

// Use of this software is governed by the Business Source License
// included in the file /licenses/bsl.md

// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

import { loadConfiguration, loadSources } from '@cucumber/cucumber/api'; // eslint-disable-line import/no-unresolved
import { promises as fsPromises } from 'fs';
import model from './index.js';

const { readFile } = fsPromises;

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
    const tagExpression = '@tls_scan';
    const { runConfiguration } = await loadConfiguration({
      provided: {
        paths: [`${this.#cucumber.features}`],
        require: [`${this.#cucumber.steps}`],
        tags: tagExpression
      }
    });
    const loadSourcesResult = await loadSources(runConfiguration.sources);
    const activeFeatureFileUris = loadSourcesResult.plan.map((pickle) => pickle.uri)
      .reduce((accum, cV) => [...accum, ...(accum.includes(cV) ? [] : [cV])], []);
    return (await Promise.all(activeFeatureFileUris
      .map((aFFU) => readFile(aFFU, { encoding: 'utf8' }))))
      .reduce((accumulatedFeatures, feature) => `${accumulatedFeatures}${!accumulatedFeatures.length > 0 ? feature : `\n\n${feature}`}`, '');
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
      '--import',
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
}

export default Tls;
