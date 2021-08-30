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

/* eslint-disable import/no-dynamic-require */
const config = require(`${process.cwd()}/config/config`);
/* eslint-enable import/no-dynamic-require */

const internals = {
  configSchemaProps: config.getSchema()._cvtProperties, // eslint-disable-line no-underscore-dangle
  log: undefined,
  properties: undefined
};

internals.sutSchema = Joi.object({
  protocol: Joi.string().required().valid('https', 'http'),
  ip: Joi.string().hostname().required(),
  port: Joi.number().port().required(),
  testSession: Joi.object({
    type: Joi.string().valid('tlsScanner').required(),
    id: Joi.string().alphanum().required(),
    attributes: Joi.object({
      tlsScannerSeverity: Joi.string().valid(...internals.configSchemaProps.sut._cvtProperties.tlsScannerSeverity.format).uppercase(), // eslint-disable-line no-underscore-dangle
      alertThreshold: Joi.number().integer().min(0).max(1000).default(config.get('sut.alertThreshold'))
    })
  })
});

const validateProperties = (sutProperties) => {
  const result = internals.sutSchema.validate(sutProperties);
  if (result.error) {
    internals.log.error(result.error.message, { tags: ['sut'] });
    throw new Error(result.error.message);
  }
  return result.value;
};

const initialiseProperties = (sutProperties) => {
  internals.properties = validateProperties(sutProperties);
};

const init = (options) => {
  internals.log = options.log;
  initialiseProperties(options.sutProperties);
};

const getProperties = (selecter) => {
  const { properties } = internals;
  if (typeof selecter === 'string') return properties[selecter];
  if (Array.isArray(selecter)) return selecter.reduce((accum, propertyName) => ({ ...accum, [propertyName]: properties[propertyName] }), {});
  return properties;
};

module.exports = {
  init,
  getProperties,
  baseUrl: () => `${internals.properties.protocol}://${internals.properties.ip}${{ http: 80, https: 443 }[internals.properties.protocol] === internals.properties.port ? '' : `:${internals.properties.port}`}`
};
