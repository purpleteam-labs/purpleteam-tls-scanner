// Copyright (C) 2017-2022 BinaryMist Limited. All rights reserved.

// Use of this software is governed by the Business Source License
// included in the file /licenses/bsl.md

// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

import Joi from 'joi';
import config from '../../../../config/config.js';

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
      alertThreshold: Joi.number().integer().min(0).max(9999).default(config.get('sut.alertThreshold'))
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

export default {
  init,
  getProperties,
  baseUrl: () => `${internals.properties.protocol}://${internals.properties.ip}${{ http: 80, https: 443 }[internals.properties.protocol] === internals.properties.port ? '' : `:${internals.properties.port}`}`
};
