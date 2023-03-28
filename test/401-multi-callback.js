'use strict';

const { expect } = require('chai');
const { ParaBench } = require('../index');

describe( 'ParaBench', () => {
    it('doesn\'t allow multiple callbacks', done => {
        const trace = [];
        const bench = new ParaBench()
            .teardown(info => {
                console.log(info);
                trace.push(info.output);
            });


        bench.probe( { arg: 2, async: true }, (n, cb) => {while(n-->0) cb(n)} )
            .then(result => {
                setTimeout(() => {
                    expect(trace).to.deep.equal([1]);
                    done();
                }, 10);
            })
            .catch(done);
    });
})
