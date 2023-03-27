'use strict';

const { expect } = require('chai');
const { ParaBench } = require ('../index.js');

describe( 'ParaBench.teardown', () => {
    it('gets executed and sets err in stat accordingly', done => {
        const bench = new ParaBench()
            .teardown((info, cb) => {
                const result = info.output;
                const wanted = info.n*(info.n-1)/2;
                if (info.n !== info.input)
                    throw('expected n to equal arg');
                if (result !== wanted)
                    cb('expected '+wanted+', found '+result);
                else
                    cb();
            });
        bench.probe({ arg: 100 }, (n, cb) => {
            let sum = 1;
            while(n-->0)
                sum += n;
            cb(sum);
        }).then( stat => {
            expect(stat.n).to.equal(100); // round-trip
            expect(stat.err).to.equal('expected 4950, found 4951');
            done();
        }).catch( done );
    });
})
