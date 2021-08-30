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

const { /* Before, */ Given, /* When, */ Then /* , After */ } = require('@cucumber/cucumber');
const { StringDecoder } = require('string_decoder');

const internals = { emissaryInProgressIntervalId: null };

internals.notifyCliPctComplete = ({ world, textChunk }) => {
  const { id: testSessionId } = world.sut.getProperties('testSession');
  const { publisher } = world;

  const pctCompleteMarkers = [
    { Start: 3 },
    { 'Testing protocols': 10 },
    { 'Testing cipher categories': 20 },
    { 'Testing robust (perfect) forward secrecy': 30 },
    { 'Testing server preferences': 40 },
    { 'Testing server defaults (Server Hello)': 50 },
    { 'Testing HTTP header response @ "/"': 60 },
    { 'Testing vulnerabilities': 70 },
    { 'Testing 370 ciphers via OpenSSL plus sockets against the server, ordered by encryption strength': 80 },
    { 'Running client simulations': 90 }
  ];

  const pctComplete = Object.values(pctCompleteMarkers.find((m) => textChunk.includes(Object.keys(m)[0])) ?? {})[0];
  pctComplete && publisher.publish(testSessionId, pctComplete, 'testerPctComplete');
};

// This is crucial, if the messaging channel stops due to no response from these test steps
//   The orchestrator will not receive new messages
//   But more importantly the orchestrator will not receive the final "Tester finished:" message, so will never clean-up.
internals.keepMessageChannelAlive = ({ world, terminate = false }) => {
  const { id: testSessionId } = world.sut.getProperties('testSession');
  const { messageChannelHeartBeatInterval } = world;
  const { publisher } = world;
  clearInterval(internals.emissaryInProgressIntervalId);
  internals.emissaryInProgressIntervalId = terminate ? null : setInterval(() => {
    publisher.pubLog({ testSessionId, logLevel: 'info', textData: 'Tester is awaiting Emissary feedback...', tagObj: { tags: [`pid-${process.pid}`, 'tls_scan_steps'] } });
  }, messageChannelHeartBeatInterval);
};

/*
Before(() => {
  // Run before *every* scenario, no matter which feature or file.
  console.log('Im currently in a Before');

});
*/

Given('a new TLS Test Session based on the Build User supplied tlsScanner resourceObject', async function () {
});

Given('the TLS Emissary is run with arguments', async function () {
  const { testSession: { id: testSessionId, attributes: { tlsScannerSeverity } } } = this.sut.getProperties(['testSession']);
  const { log, publisher, testssl: { numberOfAlertsForSesh, applyReportStyling, createProc } } = this;
  const { notifyCliPctComplete } = internals;
  if (this.sut.getProperties('protocol') !== 'https') throw new Error('Incorrect protocol supplied to the TLS Scanner. The only supported sutProtocol for the TLS Scanner is HTTPS.');

  await new Promise((resolve, reject) => {
    const decoder = new StringDecoder('utf8');
    const lineParts = [];
    let printCnt = 0;
    const headingParts = 7;

    const testssl = createProc({ tlsScannerSeverity, baseUrl: this.sut.baseUrl() });

    testssl.stdout.on('data', async (data) => {
      // clearInterval
      // resetTimeoutBuster setInterval
      internals.keepMessageChannelAlive({ world: this });

      const textChunk = decoder.write(data);

      notifyCliPctComplete({ world: this, textChunk });

      const timeToPrint = textChunk.charAt(textChunk.length - 1) === '\n';
      lineParts.push(timeToPrint ? textChunk.substring(0, textChunk.length - 1) : textChunk);

      if (timeToPrint) {
        // Replace stdout file heading by just not printing it.
        printCnt >= headingParts && publisher.pubLog({ testSessionId, logLevel: 'info', textData: lineParts.join(''), tagObj: { tags: [`pid-${process.pid}`, 'tls_scan_steps'] } });
        lineParts.length = 0;
        publisher.publish(testSessionId, await numberOfAlertsForSesh(), 'testerBugCount');
        printCnt += 1;
      }
    });

    testssl.stderr.on('data', (data) => {
      publisher.pubLog({ testSessionId, logLevel: 'error', textData: `stderr occurred: ${data.toString()}`, tagObj: { tags: [`pid-${process.pid}`, 'tls_scan_steps'] } });
    });

    testssl.on('exit', async (code, signal) => {
      await applyReportStyling();
      internals.keepMessageChannelAlive({ world: this, terminate: true });
      publisher.publish(testSessionId, 100, 'testerPctComplete');
      const errorMessage = `Child process "testssl" running session with id: "${testSessionId}" exited with code: "${code}", and signal: "${signal}".`;
      log[`${code === 0 ? 'info' : 'error'}`](errorMessage, { tags: [`pid-${process.pid}`, 'tls_scan_steps'] });
      publisher.pubLog({ testSessionId, logLevel: 'info', textData: `Finishing scan with Test Session Id: "${testSessionId}". Please see the report for further details.`, tagObj: { tags: ['tls_scan_steps'] } });
      code === 0 ? resolve() : reject(new Error(errorMessage));
    });

    testssl.on('close', (code) => {
      const message = `"close" event was emitted with code: "${code}" for "testssl" running session with id "${testSessionId}".`;
      log[`${code === 0 ? 'info' : 'error'}`](message, { tags: [`pid-${process.pid}`, 'tls'] });
    });

    testssl.on('error', (err) => {
      const textData = `Failed to start TLS Emissary. The error was: ${err}.`;
      publisher.pubLog({ testSessionId, logLevel: 'error', textData, tagObj: { tags: [`pid-${process.pid}`, 'tls_scan_steps'] } });
      reject(new Error(textData));
    });
  });
});

Then('the vulnerability count should not exceed the Build User defined threshold of vulnerabilities known to the TLS Emissary', async function () {
  const { publisher, testssl: { numberOfAlertsForSesh } } = this;
  const { testSession: { id: testSessionId, attributes: { alertThreshold } } } = this.sut.getProperties(['testSession']);

  const finalVulnCount = await numberOfAlertsForSesh();
  publisher.publish(testSessionId, finalVulnCount, 'testerBugCount');

  if (finalVulnCount > alertThreshold) {
    publisher.pubLog({ testSessionId, logLevel: 'info', textData: `Search the generated report for the ${finalVulnCount - alertThreshold} vulnerabilities that exceed the Build User defined alert threshold of "${alertThreshold}" for the Test Session with id "${testSessionId}".`, tagObj: { tags: [`pid-${process.pid}`, 'tls_scan_steps'] } });
    throw new Error(`The number of alerts (${finalVulnCount}) should be no greater than the alert threshold (${alertThreshold}).`);
  }
});

// After({ tags: '@app_scan' }, async function () {
// });
