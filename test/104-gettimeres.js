'use strict';

const { expect } = require('chai');
const { ParaBench } = require('../lib/para-bench');

describe( "ParaBench.getTimeRes", () => {
    it('produces a positive number', done => {
        for (let i = 0; i < 10; i++) {
            const tres = ParaBench.getTimeRes();
            console.log('timer resolution: ', tres);
            expect(tres).to.be.within(1e-9, 0.1);
        }
        done();
    })
})
