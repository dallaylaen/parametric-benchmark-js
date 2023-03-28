'use strict';

const { expect } = require('chai');
const { ParaBench } = require ('../index.js');

describe( 'ParaBench.teardown', () => {
    it('gets executed and sets err in stat accordingly', done => {
        const trace = [];
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
            })
            .onTeardownFail(info => trace.push(info.n));
        bench.probe({ arg: 100 }, (n, cb) => {
            let sum = 1;
            while(n-->0)
                sum += n;
            return sum;
        }).then( stat => {
            expect(stat.n).to.equal(100); // round-trip
            expect(stat.err).to.equal('expected 4950, found 4951');
            expect(trace).to.deep.equal([100]);
            done();
        }).catch( done );
    });
})
