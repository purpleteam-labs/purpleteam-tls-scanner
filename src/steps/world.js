// Copyright (C) 2017-2022 BinaryMist Limited. All rights reserved.

// Use of this software is governed by the Business Source License
// included in the file /licenses/bsl.md

// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

const config = require(`${process.cwd()}/config/config`); // eslint-disable-line import/no-dynamic-require
const log = require('purpleteam-logger').init(config.get('logger'));

const messageChannelHeartBeatInterval = config.get('messageChannelHeartBeatInterval');
const messagePublisher = require(`${process.cwd()}/src/publishers/messagePublisher`).init({ log, redis: config.get('redis.clientCreationOptions') }); // eslint-disable-line import/no-dynamic-require
// features/support/world.js
const { setWorldConstructor, setDefaultTimeout } = require('@cucumber/cucumber');

const sut = require(`${process.cwd()}/src/api/tls/do/sut`); // eslint-disable-line import/no-dynamic-require
const testssl = require(`${process.cwd()}/src/emissaries/testssl`); // eslint-disable-line import/no-dynamic-require

let timeout;

class CustomWorld {
  constructor({ attach, parameters }) {
    const { sutProperties, sutProperties: { testSession: { id: testSessionId } } } = parameters;
    this.log = log;
    this.publisher = messagePublisher;
    this.publisher.pubLog({ testSessionId, logLevel: 'info', textData: `Constructing the cucumber world for session with id "${testSessionId}".`, tagObj: { tags: [`pid-${process.pid}`, 'world'] } });
    this.attach = attach;

    this.sut = sut;
    this.sut.init({ log, sutProperties });
    this.testssl = testssl;
    this.testssl.init({ log, emissaryProperties: { ...parameters.emissaryProperties }, testSessionId });
    this.messageChannelHeartBeatInterval = messageChannelHeartBeatInterval;

    timeout = parameters.cucumber.timeout;
  }
}

setWorldConstructor(CustomWorld);
setDefaultTimeout(timeout);
