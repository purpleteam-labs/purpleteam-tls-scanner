// Copyright (C) 2017-2022 BinaryMist Limited. All rights reserved.

// Use of this software is governed by the Business Source License
// included in the file /licenses/bsl.md

// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

import { setWorldConstructor, setDefaultTimeout } from '@cucumber/cucumber';
import { init as initPtLogger } from 'purpleteam-logger';
import config from '../../config/config.js';
import { init as initMessagePublisher } from '../publishers/messagePublisher.js';
import sut from '../api/tls/do/sut.js';
import testssl from '../emissaries/testssl.js';

const messageChannelHeartBeatInterval = config.get('messageChannelHeartBeatInterval');
const log = initPtLogger(config.get('logger'));
const messagePublisher = await initMessagePublisher({ log, redis: config.get('redis.clientCreationOptions') });

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
