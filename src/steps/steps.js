// Copyright (C) 2017-2022 BinaryMist Limited. All rights reserved.

// Use of this software is governed by the Business Source License
// included in the file /licenses/bsl.md

// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// features/support/steps.js
const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert');

// Cucumber expects a non arrow function in order for the this to refer to the world.
/* eslint-disable func-names */
Given('a variable set to {int}', function (number) {
  this.setTo(number);
});

When('I increment the variable by {int}', function (number) {
  this.incrementBy(number);
});

Then('the variable should contain {int}', function (number) {
  assert(this.variable === number);
});
/* eslint-enable func-names */
