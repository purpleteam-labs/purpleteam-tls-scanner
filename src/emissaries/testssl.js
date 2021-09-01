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

const Joi = require('joi');
const { promises: fsPromises } = require('fs');
const { spawn } = require('child_process');
const Bourne = require('@hapi/bourne');

const config = require(`${process.cwd()}/config/config`); // eslint-disable-line import/no-dynamic-require
const strings = require(`${process.cwd()}/src/strings`); // eslint-disable-line import/no-dynamic-require

const internals = {
  testsslSchema: Joi.object({ reportDir: Joi.string().required().valid(config.get('emissary.report.dir')) }),
  log: undefined,
  properties: undefined,
  knownTestsslErrorsWithHelpMessageForBuildUser: [
    {
      testsslMessage: '', // Remnant from App Tester.
      helpMessageForBuildUser: '' // Remnant from App Tester.
    }
    // ,{ More errors with help messages... as we find out about them }
  ],
  reportFilePath: undefined
};

internals.validateProperties = (emissaryProperties) => {
  const result = internals.testsslSchema.validate(emissaryProperties);
  // log.debug(`result: ${JSON.stringify(result)}`);
  if (result.error) {
    internals.log.error(result.error.message, { tags: ['testssl'] });
    throw new Error(result.error.message);
  }
  return result.value;
};

const getProperties = (selecter) => {
  const { properties } = internals;
  if (typeof selecter === 'string') return properties[selecter];
  if (Array.isArray(selecter)) return selecter.reduce((accum, propertyName) => ({ ...accum, [propertyName]: properties[propertyName] }), {});
  return properties;
};

const applyReportStyling = async () => {
  const { log, reportFilePath } = internals;

  const reports = [
    // CSV has no branding, so there is nothing to replace.
    {
      format: 'html',
      preProcessedText: null,
      replacer: (t) => {
        const result = { text: null, error: undefined };
        const numOfHeadingLinesToRemove = 27;
        const replacementText = '<html><head><title>PurpleTeam TLS Scanning Report</title></head><body><div><img style="padding: 0; width: 4rem; display: inline-block;" src="data:image/png;base64,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"><h1 style="padding: 0 0 0 5px; width: 40rem; display: inline-block;">PurpleTeam TLS Scanning Report</h1></div><pre>';

        try {
          if (!t) throw new Error('The report text appears to be empty. Perhaps the file was not read successfully.');
          result.text = t.split('\n').slice(numOfHeadingLinesToRemove).reduce((accum, cV) => `${accum}\n${cV}`, replacementText);
        } catch (e) {
          result.error = `Error occurred while replacing text for ${reportFilePath}.html. The error was: ${e}`;
        }
        return result;
      },
      replacerResult: { text: null, error: undefined }
    }, {
      format: 'json',
      preProcessedText: null,
      replacer: (t) => {
        const result = { text: null, error: undefined };
        try {
          if (!t) throw new Error('The report text appears to be empty. Perhaps the file was not read successfully.');
          const { Invocation, at, version, openssl, startTime, ...theRest } = Bourne.parse(t);
          result.text = JSON.stringify({ title: 'PurpleTeam TLS Scanning Report', ...theRest }, null, '  ');
        } catch (e) {
          result.error = `Error occurred while replacing text for ${reportFilePath}.json. The error was: ${e}`;
        }
        return result;
      },
      replacerResult: { text: null, error: undefined }
    }, {
      format: 'log',
      preProcessedText: null,
      replacer: (t) => {
        // Remove the first n lines that start with '## '
        // Repalce with '## PurpleTeam TLS Scanning Report'
        const result = { text: null, error: undefined };
        const numOfHeadingLinesToRemove = 4;
        try {
          if (!t) throw new Error('The report text appears to be empty. Perhaps the file was not read successfully.');
          result.text = t.split('\n').filter((l, i) => !l.startsWith('## ') || i > numOfHeadingLinesToRemove - 1).reduce((accum, cV) => `${accum}\n${cV}`, '## PurpleTeam TLS Scanning Report');
        } catch (e) {
          result.error = `Error occurred while replacing text for ${reportFilePath}.log. The error was: ${e}`;
        }
        return result;
      },
      replacerResult: { text: null, error: undefined }
    }
  ];

  const reportsWithPreProcessedText = await Promise.all(reports.map(async (r) => {
    const fileContents = await fsPromises.readFile(`${reportFilePath}.${r.format}`, { encoding: 'utf8' }).catch((err) => {
      const message = `An error occurred while attempting to read report file ${reportFilePath}.${r.format} to apply report styling. The error was: ${err}.`;
      log.error(message, { tags: [`pid-${process.pid}`, 'testssl'] });
    });
    const { preProcessedText, ...noPreProcessedText } = r;
    return { preProcessedText: fileContents, ...noPreProcessedText };
  }));
  const reportsWithReplacerResult = reportsWithPreProcessedText.map((r) => {
    const { replacerResult, ...noReplacerResult } = r;
    return { replacerResult: r.replacer(r.preProcessedText), ...noReplacerResult };
  });
  const reporstWithReplacerResultAndNoErrors = reportsWithReplacerResult.filter((r) => {
    if (r.replacerResult.error) {
      log.error(r.replacerResult.error, { tags: [`pid-${process.pid}`, 'testssl'] });
      return false;
    }
    return true;
  });
  await Promise.all(reporstWithReplacerResultAndNoErrors.map(async (r) => {
    await fsPromises.writeFile(`${reportFilePath}.${r.format}`, r.replacerResult.text).catch((e) => {
      log.error(`Error occurred while writing replacement text back to ${reportFilePath}.${r.format}. The error was: ${e}`, { tags: [`pid-${process.pid}`, 'testssl'] });
    });
  }));
};

const numberOfAlertsForSesh = async () => {
  const { log, reportFilePath } = internals;
  let count = 0;
  await fsPromises.readFile(`${reportFilePath}.csv`, { encoding: 'utf8' })
    .then((reportText) => {
      // First line is headings.
      // After that we inspect element 3 ("severity") of every row.

      // We always get OK and INFO if tlsScannerSeverity is undefined.
      // We always get WARN, don't count this as a defect.

      // Ignore any lines with OK, INFO or WARN. Everything else is counted as a defect.
      const vulns = reportText.split('\n')
        .filter((e, i) => i > 0) // Remove heading row.
        .filter((e) => e.split(',')[0] !== '"service"') // Remove any "service" rows.
        .filter((e) => e.length > 0) // Remove empty lines (expecting just the last line).
        .filter((e) => {
          const severity = e.split(',')[3];
          return severity !== '"OK"' && severity !== '"INFO"' && severity !== '"WARN"';
        });
      count = vulns.length;
    })
    .catch((err) => {
      const message = `An error occurred while attempting to read report file ${reportFilePath}.csv to establish the vulnerability count. The error was: ${err}.`;
      log.error(message, { tags: [`pid-${process.pid}`, 'testssl'] });
    });
  return count;
};

const createProc = ({ tlsScannerSeverity, baseUrl }) => {
  const { reportFilePath } = internals;
  return spawn('./testssl/testssl.sh', ['--ip=one', '--warnings', 'off', '--outFile', reportFilePath, ...(tlsScannerSeverity ? ['--severity', tlsScannerSeverity] : []), baseUrl]);
};

const init = (options) => {
  internals.log = options.log;
  const { emissaryProperties, testSessionId } = options;
  const { validateProperties } = internals;
  internals.properties = { knownTestsslErrorsWithHelpMessageForBuildUser: internals.knownTestsslErrorsWithHelpMessageForBuildUser, ...validateProperties(emissaryProperties) };
  internals.reportFilePath = `${getProperties('reportDir')}report_tlsScannerId-${testSessionId}_${strings.NowAsFileName()}`;
};

module.exports = {
  getProperties,
  applyReportStyling,
  numberOfAlertsForSesh,
  createProc,
  init
};
